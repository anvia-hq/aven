import { Agent, createTool } from "@anvia/core";
import { DurableRuntime } from "@anvia/durable";
import { SqliteDurableStore } from "@anvia/durable/sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";

test("a run resumes after the runtime closes, reusing committed tool results", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aven-durable-"));
  const db = join(dir, "runs.db");
  let ran = 0;
  const counter = createTool({
    name: "count",
    description: "Counts",
    inputSchema: z.object({ n: z.number() }),
    execute: async () => ({ ran: ++ran }),
  });
  const hold = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();

  const open = (steps: Parameters<typeof scriptedModel>[0]) =>
    DurableRuntime.open({
      store: new SqliteDurableStore(db),
      agents: [
        {
          agent: new Agent({
            id: "coding",
            model: scriptedModel(steps),
            instructions: "x",
            tools: [counter],
          }),
          version: "1",
          toolRecovery: { count: "safe" },
        },
      ],
    });

  const first = await open([
    [toolCall("count", { n: 1 }, "c1")],
    async () => {
      reached.resolve();
      await hold.promise;
      return [text("never")];
    },
  ]);
  const run = await first.submit({
    agentId: "coding",
    sessionId: "thread-1",
    requestId: "run-1",
    prompt: "go",
  });
  await reached.promise;
  const closing = first.close();
  hold.resolve();
  await closing;
  expect(ran).toBe(1);

  const second = await open([[text("done")]]);
  await second.resume();
  const resumed = await second.getRun(run.id);
  const outcome = await resumed.result();
  expect(outcome.type).toBe("response");
  expect(ran).toBe(1);
  await second.close();
});
