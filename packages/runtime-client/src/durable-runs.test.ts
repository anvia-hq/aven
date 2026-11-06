import {
  Agent,
  Usage,
  createQuestionTool,
  createTool,
  getAssistantGenerationMetadata,
  type CompletionRequest,
} from "@anvia/core";
import {
  COMPACT_PROMPT,
  COMPACTED,
  NOTHING_TO_COMPACT,
  createCompactionAgent,
} from "@aven/agents/compaction-agent";
import { scriptedModel, text, type ScriptStep } from "@aven/agents/testing/scripted-model";
import type { RunEvent } from "@aven/protocol/events";
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { hostname } from "node:os";
import { z } from "zod";

import { DurableRuns, type RunInput } from "./durable-runs";
import { goalSessionMarker } from "./goal-report";
import { journalPath } from "./testing/journal-path";
import { defaultCreateAgent } from "./runner";

const question: ScriptStep = [
  {
    type: "tool-call",
    toolCallId: "q1",
    toolName: "ask_user",
    input: { questions: [{ id: "color", text: "Which color?" }] },
  },
];

const input = (id: string, ...steps: ScriptStep[]): RunInput => ({
  agent: new Agent({
    id,
    instructions: "x",
    tools: [createQuestionTool()],
    model: scriptedModel(steps),
  }),
});

const open: DurableRuns[] = [];
afterEach(async () => {
  for (const runs of open.splice(0)) await runs.close();
});
const opened = async (path: string) => {
  const runs = await DurableRuns.open(path);
  open.push(runs);
  return runs;
};
const closed = async (runs: DurableRuns, release?: () => void) => {
  const closing = runs.close();
  release?.();
  await closing;
  open.splice(open.indexOf(runs), 1);
};

describe("the default runtime agent's model retries", () => {
  test.each(["thread", "subagent"] as const)(
    "%s completes after a transient gateway failure under its own retry owner",
    async (kind) => {
      let attempts = 0;
      const server = Bun.serve({
        port: 0,
        fetch() {
          if (++attempts === 1)
            return Response.json({ error: { message: "try again" } }, { status: 503 });
          const chunk = (delta: Record<string, unknown>, finish: string | null) =>
            `data: ${JSON.stringify({
              id: "chatcmpl-retry",
              object: "chat.completion.chunk",
              created: 0,
              model: "fake-model",
              choices: [{ index: 0, delta, finish_reason: finish }],
            })}\n\n`;
          return new Response(
            chunk({ role: "assistant", content: "done" }, null) +
              chunk({}, "stop") +
              "data: [DONE]\n\n",
            { headers: { "content-type": "text/event-stream" } },
          );
        },
      });
      try {
        const built = defaultCreateAgent(`http://localhost:${server.port}`)({
          id: `retry-${kind}`,
          thread: { id: "thread-1", organizationId: "org-1" },
          attended: false,
          tools: [],
          role: kind === "subagent" ? "general" : undefined,
          model: {
            provider: "openai-compatible",
            modelId: "fake-model",
            gatewayPath: "/v1",
            gatewayToken: "local-test-token",
          },
        });
        const runThread = async () => {
          const runs = await opened(journalPath());
          const followed = await runs.start("retry-run", "thread-1", "go", built, () => {});
          return followed.done;
        };
        const end =
          kind === "thread" ? await runThread() : await built.agent.stream({ prompt: "go" }).result;
        expect(end).toMatchObject({ type: "response" });
        expect(attempts).toBe(2);
      } finally {
        await server.stop(true);
      }
    },
  );
});

describe("DurableRuns after the process restarts", () => {
  test("a run parked on a question is answered by a process that never saw it", async () => {
    const path = journalPath();
    const before = await opened(path);
    const asked = await before.start(
      "run-1",
      "thread-1",
      "paint it",
      input("run-1", question),
      () => {},
    );
    const end = await asked.done;
    expect(end.type).toBe("interaction");
    if (end.type !== "interaction") return;
    const { interaction } = end.continuation as {
      interaction: { id: string; toolCallId: string };
    };
    await closed(before);

    const after = await opened(path);
    const parked = await after.asked("thread-1");
    expect(parked?.agentId).toBe("run-1");

    const events: RunEvent[] = [];
    const answered = await after.answer(
      parked!,
      interaction,
      { type: "tool-question", answers: [{ questionId: "color", value: "red" }] },
      () => input("run-1", [text("Going with red")]),
      (event) => events.push(event),
    );
    expect(await answered.done).toMatchObject({ type: "response" });
    expect(events).toContainEqual({ type: "text", delta: "Going with red" });
    expect(await after.asked("thread-1")).toBeUndefined();
  });

  test("a run that was working is ended, so its thread can start another", async () => {
    const path = journalPath();
    const before = await opened(path);
    const hold = Promise.withResolvers<void>();
    const reached = Promise.withResolvers<void>();
    const working = await before.start(
      "run-1",
      "thread-1",
      "go",
      input("run-1", async () => {
        reached.resolve();
        await hold.promise;
        return [text("never")];
      }),
      () => {},
    );
    // The stopped process's own follow ends with the journal; nothing is listening for it.
    working.done.catch(() => undefined);
    await reached.promise;
    await closed(before, hold.resolve);

    const after = await opened(path);
    expect(await after.asked("thread-1")).toBeUndefined();
    const next = await after.start(
      "run-2",
      "thread-1",
      "again",
      input("run-2", [text("hi")]),
      () => {},
    );
    expect(await next.done).toMatchObject({ type: "response" });
  });
});

describe("DurableRuns after a reload in the same process", () => {
  test("a lease this process's earlier life left behind does not lock the journal", async () => {
    const path = journalPath();
    await (await DurableRuns.open(path)).close();
    const database = new Database(path);
    database
      .query("UPDATE anvia_durable_owner SET token = 'stale', pid = ?, host = ?")
      .run(process.pid, hostname());
    database.close();
    await opened(path);
  });

  test("a journal that is open in this process is not opened twice", async () => {
    const path = journalPath();
    await opened(path);
    await expect(DurableRuns.open(path)).rejects.toThrow("already open");
  });
});

describe("DurableRuns goals", () => {
  const request = {
    objective: "Make the tests pass",
    acceptanceCriteria: ["bun test passes"],
    verifyCommands: ["bun test"],
  };
  const results = (...exitCodes: number[]) => {
    let calls = 0;
    return async () => [
      {
        command: "bun test",
        exitCode: exitCodes[Math.min(calls++, exitCodes.length - 1)] ?? 0,
        output: "1 failed",
      },
    ];
  };

  test("works in sessions until the commands pass, reporting each session's events and messages", async () => {
    const runs = await opened(journalPath());
    const events: RunEvent[] = [];
    const sessions: string[][] = [];
    const goal = await runs.startGoal({
      runId: "run-1",
      request,
      input: input("goal-run-1", [text("first try")], [text("fixed it")]),
      verify: results(1, 0),
      onEvent: (event) => events.push(event),
      onSession: async (session, messages) =>
        void sessions.push([String(session), ...messages.map((message) => message.role)]),
    });

    expect(await goal.done).toMatchObject({ type: "complete", evidence: ["`bun test` passed"] });
    // A divider opens each session, then the session's own text.
    expect(events.filter((event) => event.type === "text")).toEqual([
      { type: "text", delta: goalSessionMarker(1) },
      { type: "text", delta: "first try" },
      { type: "text", delta: goalSessionMarker(2) },
      { type: "text", delta: "fixed it" },
    ]);
    // Each session's prompt, then its reply.
    expect(sessions).toEqual([
      ["1", "user", "assistant"],
      ["2", "user", "assistant"],
    ]);
  });

  test("a goal whose commands keep failing the same way stops short instead of looping", async () => {
    const runs = await opened(journalPath());
    const goal = await runs.startGoal({
      runId: "run-1",
      request,
      input: input("goal-run-1", [text("a")], [text("b")], [text("c")], [text("d")]),
      verify: results(1),
      onEvent: () => {},
      onSession: async () => {},
    });
    expect(await goal.done).toMatchObject({ type: "paused", reason: "no_progress" });
  });

  test("a goal's agent is released when it ends, so the id can be used again", async () => {
    const runs = await opened(journalPath());
    for (const id of ["a", "b"]) {
      const goal = await runs.startGoal({
        runId: `run-${id}`,
        request: { ...request, verifyCommands: [] },
        input: input("goal-run-1", [text(id)]),
        verify: async () => [],
        onEvent: () => {},
        onSession: async () => {},
      });
      expect((await goal.done).type).toBe("complete");
    }
  });
});

describe("DurableRuns tool concurrency", () => {
  // Three calls in one model turn to a tool that takes a moment, and the most of them at once.
  async function mostAtOnce(withQuestionTool: boolean) {
    let running = 0;
    let most = 0;
    const slow = createTool({
      name: "slow",
      description: "Takes a moment.",
      inputSchema: z.object({ n: z.number() }),
      async execute() {
        running += 1;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 50));
        running -= 1;
        return "ok";
      },
    });
    const calls: ScriptStep = [1, 2, 3].map((n) => ({
      type: "tool-call" as const,
      toolCallId: `c${n}`,
      toolName: "slow",
      input: { n },
    }));
    const runs = await opened(journalPath());
    const started = await runs.start(
      "run-1",
      "thread-1",
      "go",
      {
        agent: new Agent({
          id: "run-1",
          instructions: "x",
          tools: withQuestionTool ? [slow, createQuestionTool()] : [slow],
          model: scriptedModel([calls, [text("done")]]),
        }),
      },
      () => {},
    );
    expect(await started.done).toMatchObject({ type: "response" });
    return most;
  }

  test("a run with no one to answer calls its tools side by side", async () => {
    expect(await mostAtOnce(false)).toBe(3);
  });

  // The limit is Anvia's own, not ours: an agent that can ask a question runs its tools one at a
  // time. This test says so; when Anvia lifts it, the attended runs speed up and this one changes.
  test("a run that can ask a question still calls its tools one at a time", async () => {
    expect(await mostAtOnce(true)).toBe(1);
  });
});

describe("a run that only compacts (decision 0097)", () => {
  // The conversation so far: two turns, which the compaction run summarizes.
  const talk = async (runs: DurableRuns, sessionId: string) => {
    for (const [index, word] of ["alpha", "beta"].entries()) {
      const run = await runs.start(
        `talk-${index}`,
        sessionId,
        word,
        input(`talk-${index}`, [text(`heard ${word}`)]),
        () => {},
      );
      await run.done;
    }
  };

  const compact = async (runs: DurableRuns, sessionId: string, summary: string) => {
    const events: RunEvent[] = [];
    const run = await runs.start(
      "compact-1",
      sessionId,
      COMPACT_PROMPT,
      {
        ...createCompactionAgent({ id: "compact-1", model: scriptedModel([[text(summary)]]) }),
      },
      (event) => events.push(event),
    );
    const end = await run.done;
    return { end, events };
  };

  test("summarizes what came before and says so", async () => {
    const runs = await opened(journalPath());
    await talk(runs, "thread-c");
    const { end, events } = await compact(runs, "thread-c", "They greeted: alpha, beta.");
    expect(end.type).toBe("response");
    const reply = end.type === "response" ? JSON.stringify(end.messages.at(-1)) : "";
    expect(reply).toContain(COMPACTED);
    expect(events.some((event) => event.type === "usage")).toBe(true);
  });

  test("counts what the summary cost, and the new size of the history as the context", async () => {
    const runs = await opened(journalPath());
    await talk(runs, "thread-u");
    // A summary model that says what its call cost.
    const base = scriptedModel([[text("They greeted: alpha, beta.")]]);
    const billed = { ...Usage.empty(), inputTokens: 500, outputTokens: 40, totalTokens: 540 };
    const summaryModel = {
      ...base,
      completion: async (request: CompletionRequest) => ({
        ...(await base.completion(request)),
        usage: billed,
      }),
    };
    const events: RunEvent[] = [];
    const run = await runs.start(
      "compact-u",
      "thread-u",
      COMPACT_PROMPT,
      {
        ...createCompactionAgent({ id: "compact-u", model: summaryModel, contextWindow: 10_000 }),
        // As the runner gives it, for the usage events' context.
        contextWindow: 10_000,
      },
      (event) => events.push(event),
    );
    const end = await run.done;
    const usage = events.filter((event) => event.type === "usage");
    // The call is counted once, at what it cost; the context is the history as it is now, which
    // is far from the 500 tokens the summary call read.
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ turn: { inputTokens: 500, outputTokens: 40 } });
    const context = usage[0]?.type === "usage" ? usage[0].context : undefined;
    expect(context?.contextWindow).toBe(10_000);
    expect(context?.usedTokens).toBeGreaterThan(0);
    expect(context?.usedTokens).toBeLessThan(500);
    // A reload reads the same from the stored message.
    const stored =
      end.type === "response" ? getAssistantGenerationMetadata(end.messages.at(-1)!) : undefined;
    expect(stored?.usage.inputTokens).toBe(500);
    expect(stored?.contextUsage?.usedTokens).toBe(context?.usedTokens);
  });

  test("a thread with nothing before the prompt has nothing to compact", async () => {
    const runs = await opened(journalPath());
    const { end } = await compact(runs, "thread-empty", "unused");
    const reply = end.type === "response" ? JSON.stringify(end.messages.at(-1)) : "";
    expect(reply).toContain(NOTHING_TO_COMPACT);
  });

  test("the next message sees the summary in place of the turns it covers", async () => {
    const runs = await opened(journalPath());
    await talk(runs, "thread-d");
    await compact(runs, "thread-d", "They greeted: alpha, beta.");
    const seen: string[] = [];
    // Durable applies the summary to a run that has a compaction policy of its own, as every run
    // of a model with a known window has: here one that is far from being reached.
    const next = await runs.start(
      "after-1",
      "thread-d",
      "gamma",
      {
        ...input("after-1", (request) => {
          seen.push(JSON.stringify(request.chatHistory));
          return [text("ok")];
        }),
        compaction: {
          trigger: { afterTokens: 1_000_000 },
          compactor: createCompactionAgent({ id: "unused", model: scriptedModel([]) }).compaction
            .compactor,
        },
      },
      () => {},
    );
    await next.done;
    expect(seen[0]).toContain("They greeted: alpha, beta.");
    expect(seen[0]).not.toContain("heard alpha");
  });
});

describe("steering a run that is going (decision 0098)", () => {
  // A run whose first step is a tool that waits, so the person speaks while it works.
  const slowRun = () => {
    const gate = Promise.withResolvers<void>();
    const seen: string[] = [];
    const slow = createTool({
      name: "slow",
      description: "Takes a while",
      inputSchema: z.object({}),
      execute: async () => {
        await gate.promise;
        return "done";
      },
    });
    const agent = new Agent({
      id: "steered",
      instructions: "x",
      tools: [slow],
      model: scriptedModel([
        [{ type: "tool-call", toolCallId: "c1", toolName: "slow", input: {} }],
        (request) => {
          seen.push(JSON.stringify(request.chatHistory));
          return [text("changed course")];
        },
      ]),
    });
    return { agent, gate, seen };
  };

  test("a message sent during a tool is taken at the next step, and the run says so", async () => {
    const runs = await opened(journalPath());
    const { agent, gate, seen } = slowRun();
    const events: RunEvent[] = [];
    const run = await runs.start("steer-1", "thread-s", "build it", { agent }, (e) =>
      events.push(e),
    );
    // The tool is running once the call is announced.
    for (let i = 0; i < 100 && !events.some((e) => e.type === "tool_start"); i++)
      await Bun.sleep(10);

    expect(await runs.steer(run.durableId, "use the other API", "steer-a")).toBe(true);
    gate.resolve();
    const end = await run.done;

    expect(end.type).toBe("response");
    expect(events.filter((e) => e.type === "steer_applied")).toEqual([
      { type: "steer_applied", id: "steer-a" },
    ]);
    // The model's next request has the message after the tool's result, and the transcript keeps it.
    expect(seen[0]).toContain("use the other API");
    expect(seen[0]!.indexOf("done")).toBeLessThan(seen[0]!.indexOf("use the other API"));
    const roles = end.type === "response" ? end.messages.map((message) => message.role) : [];
    expect(roles).toEqual(["user", "assistant", "tool", "user", "assistant"]);
  });

  test("a message the agent took is filed with a run that is then cancelled", async () => {
    const runs = await opened(journalPath());
    const toolGate = Promise.withResolvers<void>();
    const modelGate = Promise.withResolvers<void>();
    const slow = createTool({
      name: "slow",
      description: "Takes a while",
      inputSchema: z.object({}),
      execute: async () => {
        await toolGate.promise;
        return "done";
      },
    });
    const agent = new Agent({
      id: "steered-cancelled",
      instructions: "x",
      tools: [slow],
      model: scriptedModel([
        [{ type: "tool-call", toolCallId: "c1", toolName: "slow", input: {} }],
        // The model call after the message is taken never ends: the run is stopped there.
        async () => {
          await modelGate.promise;
          return [text("never")];
        },
      ]),
    });
    const events: RunEvent[] = [];
    const run = await runs.start("steer-3", "thread-u", "build it", { agent }, (e) =>
      events.push(e),
    );
    for (let i = 0; i < 100 && !events.some((e) => e.type === "tool_start"); i++)
      await Bun.sleep(10);
    expect(await runs.steer(run.durableId, "use the other API", "steer-c")).toBe(true);
    toolGate.resolve();
    for (let i = 0; i < 100 && !events.some((e) => e.type === "steer_applied"); i++)
      await Bun.sleep(10);
    await run.cancel();
    modelGate.resolve();
    expect((await run.done).type).toBe("error");

    // What the person said and the agent took is not lost with the rest of the run.
    const filed = await runs.unfinishedMessages(run.durableId);
    expect(filed.map((message) => message.role)).toEqual(["user", "user"]);
    expect(JSON.stringify(filed)).toContain("build it");
    expect(JSON.stringify(filed)).toContain("use the other API");
  });

  test("a run that has ended takes no more", async () => {
    const runs = await opened(journalPath());
    const run = await runs.start(
      "steer-2",
      "thread-t",
      "hi",
      input("steer-2", [text("ok")]),
      () => {},
    );
    await run.done;
    expect(await runs.steer(run.durableId, "too late", "steer-b")).toBe(false);
  });
});

describe("a long run", () => {
  // Durable 0.14 moves a payload over 64 KiB to a blob, but a history of many smaller results is
  // still one payload against `maxPayloadBytes`, which passes durable's default megabyte after a
  // few dozen steps. This ends with "Durable payload byte limit exceeded" without the budget set in
  // `DurableRuns.open`.
  test("of mid-size tool results keeps within the payload budget", async () => {
    const output = "x".repeat(40 * 1024);
    const run = createTool({
      name: "run",
      description: "A command",
      inputSchema: z.object({}),
      execute: async () => output,
    });
    const call = (index: number): ScriptStep => [
      { type: "tool-call", toolCallId: `c${index}`, toolName: "run", input: {} },
    ];
    const agent = new Agent({
      id: "long",
      instructions: "x",
      tools: [run],
      maxTurns: 200,
      model: scriptedModel([
        ...Array.from({ length: 60 }, (_, index) => call(index)),
        [text("done")],
      ]),
    });
    const runs = await opened(journalPath());
    const followed = await runs.start("long", "thread-long", "go", { agent }, () => {});
    expect(await followed.done).toMatchObject({ type: "response" });
  });
});
