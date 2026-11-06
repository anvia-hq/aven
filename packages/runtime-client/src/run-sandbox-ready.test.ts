import { Agent, createTool, type AnyTool } from "@anvia/core";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";

import { startRuntime } from "./runner";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";
import { fakeControlPlane } from "./testing/fake-control-plane";
import { journalPath } from "./testing/journal-path";
import { noProcesses } from "./thread-processes";

const thread = { id: "thread-1", organizationId: "org-1" };
const runStart = { type: "run.start", runId: "run-1", thread, prompt: "hi" } as const;

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await Bun.sleep(20);
  expect(condition()).toBe(true);
};

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

// A sandbox whose workspace and container are ready when the test says, as a restore and a
// container start are some seconds after the run begins (decision 0128).
function slowSandbox() {
  const events: string[] = [];
  let open!: () => void;
  let fail!: (error: Error) => void;
  const gate = new Promise<void>((resolve, reject) => {
    open = resolve;
    fail = reject;
  });
  gate.catch(() => undefined);
  const probe: AnyTool = createTool({
    name: "probe",
    description: "probe",
    inputSchema: z.object({}),
    execute: async () => {
      events.push("tool ran");
      return "ok";
    },
  });
  const workspaces: ThreadWorkspaces = {
    async acquire(_thread, _repo, options): Promise<ThreadSandbox> {
      events.push(options?.lazy ? "acquired lazily" : "acquired");
      return {
        tools: [probe],
        hasRunningProcesses: async () => false,
        processes: noProcesses,
        start: async () => {
          await gate;
          events.push("sandbox ready");
        },
      };
    },
    desktop: () => undefined,
    workspace: async () => undefined,
    async release() {},
    async dispose() {},
  };
  return { workspaces, events, open, fail };
}

function connect(sandbox: ThreadWorkspaces) {
  const plane = fakeControlPlane({});
  const runtime = startRuntime({
    url: plane.url,
    token: "t",
    journalPath: journalPath(),
    sandbox,
    createAgent: ({ id, tools }) => ({
      agent: new Agent({
        id,
        instructions: "x",
        tools: [...tools],
        model: scriptedModel([[toolCall("probe", {})], [text("done")]]),
      }),
    }),
    typingPause: async () => undefined,
  });
  cleanups.push(() => runtime.stop(), plane.stop);
  return { plane, runtime };
}

const ended = (plane: ReturnType<typeof fakeControlPlane>) =>
  plane.received.filter((message) => message.type === "run.end");
const heard = (plane: ReturnType<typeof fakeControlPlane>, what: string) =>
  plane.received.some((message) => JSON.stringify(message).includes(what));

describe("a run whose sandbox is still being got ready (decision 0128)", () => {
  test("starts the agent at once, and its tool waits for the sandbox", async () => {
    const sandbox = slowSandbox();
    const { plane, runtime } = connect(sandbox.workspaces);
    await runtime.ready;
    plane.send(runStart);

    // The model has answered, with a call, while nothing of the sandbox is there.
    await until(() => heard(plane, "tool_start"));
    expect(sandbox.events).toEqual(["acquired lazily"]);
    expect(ended(plane)).toHaveLength(0);

    sandbox.open();
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });
    expect(sandbox.events).toEqual(["acquired lazily", "sandbox ready", "tool ran"]);
  });

  test("ends the run with why when the sandbox cannot be had", async () => {
    const sandbox = slowSandbox();
    const { plane, runtime } = connect(sandbox.workspaces);
    await runtime.ready;
    plane.send(runStart);
    await until(() => heard(plane, "tool_start"));

    sandbox.fail(new Error("Could not start the sandbox: docker is not running"));
    await until(() => ended(plane).length === 1);

    expect(ended(plane)[0]).toMatchObject({
      outcome: "error",
      error: "Could not start the sandbox: docker is not running",
    });
    expect(sandbox.events).not.toContain("tool ran");
  });
});
