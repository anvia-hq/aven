import { describe, expect, spyOn, test } from "bun:test";
import type { DurableRun, DurableRuntime, DurableTaskHandle, GoalResult } from "@anvia/durable";
import type { Message } from "@anvia/core";
import type { DurableEnd, GoalState, RunInput } from "@aven/agent-backend/types";
import type { RunEvent } from "@aven/protocol/types";

import { defineAvenGoal, startGoal } from "./durable-goals";
import type { GoalContext, GoalJournal } from "../types";

type TaskEvent = {
  type: string;
  taskId: string;
  data: Record<string, unknown>;
};

function fakeJournal({
  events,
  result = { handoff: { summary: "all done", evidence: ["tests pass"] } },
  checkpoint = {},
  sessionOutcomes = {},
  runningRuns = [],
  failSubmit,
}: {
  events: TaskEvent[];
  result?: { handoff: { summary: string; evidence: string[] } };
  checkpoint?: Record<string, unknown>;
  sessionOutcomes?: Record<string, Promise<DurableEnd> | DurableEnd>;
  runningRuns?: { id: string; agentId: string }[];
  failSubmit?: Error;
}) {
  const released: string[] = [];
  const revived: string[][] = [];
  const steered: { durableId: string; prompt: unknown; requestId: string }[] = [];
  const cancelled = { count: 0 };
  const contexts = new Map<string, GoalContext>();
  const handle = {
    id: "task-1",
    async *stream() {
      for (const event of events) {
        yield event;
        await Bun.sleep(1);
      }
    },
    result: async () => result as unknown as GoalResult,
    snapshot: async () => ({ task: { checkpoint } }),
    cancel: async () => {
      cancelled.count++;
    },
  } as unknown as DurableTaskHandle<GoalResult>;

  const runtime = {
    submitGoal: async () => {
      if (failSubmit) throw failSubmit;

      return handle;
    },
    getRun: async (id: string) => ({ id }) as unknown as DurableRun,
    listRuns: async () => ({ runs: runningRuns }),
  } as unknown as DurableRuntime;

  const journal: GoalJournal = {
    runtime,
    goal: defineAvenGoal(contexts),
    contexts,
    registerOrKeep: async () => {},
    follow(run, _input, _onEvent) {
      const outcome = sessionOutcomes[run.id] ?? { type: "response", messages: [] };
      return {
        durableId: run.id,
        done: Promise.resolve(outcome),
        cancel: async () => {},
      };
    },
    release: async (agentId) => {
      released.push(agentId);
    },
    revive: async (agentIds) => {
      revived.push([...agentIds]);
    },
    steer: async (durableId, prompt, requestId) => {
      steered.push({ durableId, prompt, requestId });
      return true;
    },
  };

  return { journal, contexts, released, revived, steered, cancelled };
}

const agentInput = (id = "goal-1"): RunInput => ({ agent: { id } as never });

describe("durable goals", () => {
  test("runs multi-session goal loop to completion and records each session", async () => {
    const s1Messages: Message[] = [{ role: "assistant", content: "step 1" }];
    const s2Messages: Message[] = [{ role: "assistant", content: "step 2" }];
    const { journal, contexts, released } = fakeJournal({
      events: [
        {
          type: "status",
          taskId: "task-1",
          data: { status: "waiting", wait: { type: "agent", runId: "s-1" } },
        },
        {
          type: "status",
          taskId: "task-1",
          data: { status: "waiting", wait: { type: "agent", runId: "s-2" } },
        },
        { type: "status", taskId: "task-1", data: { status: "completed" } },
      ],
      sessionOutcomes: {
        "s-1": { type: "response", messages: s1Messages },
        "s-2": { type: "response", messages: s2Messages },
      },
    });
    const emitted: RunEvent[] = [];
    const filed: { session: number; messages: Message[] }[] = [];
    const states: GoalState[] = [];

    const working = await startGoal(journal, {
      runId: "r1",
      request: { objective: "ship it", acceptanceCriteria: ["green"] },
      input: agentInput(),
      verify: async () => [],
      onEvent: (event) => emitted.push(event),
      onSession: async (session, messages) => {
        filed.push({ session, messages });
      },
      saveState: (state) => states.push(structuredClone(state)),
    });

    const end = await working.done;
    expect(end).toEqual({ type: "complete", summary: "all done", evidence: ["tests pass"] });
    expect(filed).toEqual([
      { session: 1, messages: s1Messages },
      { session: 2, messages: s2Messages },
    ]);
    expect(emitted.filter((event) => event.type === "text")).toHaveLength(2);
    expect(states.at(-1)?.sessions).toEqual({
      "s-1": { number: 1, filed: true },
      "s-2": { number: 2, filed: true },
    });
    expect(contexts.size).toBe(0);
    expect(released).toEqual(["goal-1"]);
  });

  test("returns paused outcome when waiting on a signal and cancels the task handle", async () => {
    const { journal, cancelled } = fakeJournal({
      events: [
        { type: "status", taskId: "task-1", data: { status: "waiting", wait: { type: "signal" } } },
      ],
      checkpoint: {
        pauseReason: "needs approval",
        handoff: { summary: "halfway", next: "deploy" },
      },
    });

    const working = await startGoal(journal, {
      runId: "r2",
      request: { objective: "deploy", acceptanceCriteria: ["live"] },
      input: agentInput(),
      verify: async () => [],
      onEvent: () => {},
      onSession: async () => {},
    });

    expect(await working.done).toEqual({
      type: "paused",
      reason: "needs approval",
      summary: "halfway",
      next: "deploy",
    });
    expect(cancelled.count).toBe(1);
  });

  test("returns error outcome on failed or cancelled status and forwards cancel()", async () => {
    const { journal, cancelled } = fakeJournal({
      events: [
        { type: "status", taskId: "task-1", data: { status: "cancelled", error: "stopped" } },
      ],
    });

    const working = await startGoal(journal, {
      runId: "r3",
      request: { objective: "cancel me", acceptanceCriteria: ["none"] },
      input: agentInput(),
      verify: async () => [],
      onEvent: () => {},
      onSession: async () => {},
    });

    await working.cancel();
    expect(cancelled.count).toBe(1);
    expect(await working.done).toEqual({ type: "error", error: "stopped" });
  });

  test("steers active session or falls back to listing running runs", async () => {
    const gate = Promise.withResolvers<DurableEnd>();
    const { journal, steered } = fakeJournal({
      events: [
        {
          type: "status",
          taskId: "task-1",
          data: { status: "waiting", wait: { type: "agent", runId: "s-active" } },
        },
        { type: "status", taskId: "task-1", data: { status: "completed" } },
      ],
      sessionOutcomes: { "s-active": gate.promise },
      runningRuns: [{ id: "s-listed", agentId: "goal-1" }],
    });

    const working = await startGoal(journal, {
      runId: "r4",
      request: { objective: "steer", acceptanceCriteria: ["done"] },
      input: agentInput(),
      verify: async () => [],
      onEvent: () => {},
      onSession: async () => {},
    });

    await Bun.sleep(5);
    expect(await working.steer("change course", "req-1")).toBe(true);
    expect(steered[0]).toEqual({
      durableId: "s-active",
      prompt: "change course",
      requestId: "req-1",
    });

    gate.resolve({ type: "response", messages: [] });
    await working.done;

    expect(await working.steer("fallback", "req-2")).toBe(true);
    expect(steered[1]).toEqual({
      durableId: "s-listed",
      prompt: "fallback",
      requestId: "req-2",
    });
  });

  test("logs session follow errors instead of silently swallowing them", async () => {
    const logged: unknown[][] = [];
    const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    try {
      const { journal } = fakeJournal({
        events: [
          {
            type: "status",
            taskId: "task-1",
            data: { status: "waiting", wait: { type: "agent", runId: "s-bad" } },
          },
          { type: "status", taskId: "task-1", data: { status: "completed" } },
        ],
        sessionOutcomes: { "s-bad": Promise.reject(new Error("session stream broke")) },
      });

      const working = await startGoal(journal, {
        runId: "r5",
        request: { objective: "recover", acceptanceCriteria: ["done"] },
        input: agentInput(),
        verify: async () => [],
        onEvent: () => {},
        onSession: async () => {},
      });

      expect((await working.done).type).toBe("complete");
      expect(logged.some((args) => args.join(" ").includes("session stream broke"))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  test("revives restored goals, rejects missing agent, and cleans up on submitGoal failure", async () => {
    const restored = fakeJournal({
      events: [{ type: "status", taskId: "task-1", data: { status: "completed" } }],
    });
    const working = await startGoal(restored.journal, {
      runId: "r6",
      request: { objective: "resume", acceptanceCriteria: ["done"] },
      input: agentInput("goal-resume"),
      verify: async () => [],
      onEvent: () => {},
      onSession: async () => {},
      state: { sessions: { "s-prev": { number: 1, filed: true } } },
    });
    await working.done;
    expect(restored.revived).toEqual([["goal-resume"]]);

    await expect(
      startGoal(restored.journal, {
        runId: "r7",
        request: { objective: "no agent", acceptanceCriteria: [] },
        input: {},
        verify: async () => [],
        onEvent: () => {},
        onSession: async () => {},
      }),
    ).rejects.toThrow("without an agent");

    const broken = fakeJournal({ events: [], failSubmit: new Error("submit failed") });
    await expect(
      startGoal(broken.journal, {
        runId: "r8",
        request: { objective: "broken", acceptanceCriteria: [] },
        input: agentInput("goal-broken"),
        verify: async () => [],
        onEvent: () => {},
        onSession: async () => {},
      }),
    ).rejects.toThrow("submit failed");
    expect(broken.contexts.size).toBe(0);
    expect(broken.released).toEqual(["goal-broken"]);
  });
});
