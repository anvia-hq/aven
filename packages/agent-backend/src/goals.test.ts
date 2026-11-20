import { describe, expect, test } from "bun:test";

import { runBackendGoal } from "./goals";
import type { BackendImage, BackendUserInput, GoalSpec } from "./types";

function specOf(extra: Partial<GoalSpec> = {}): GoalSpec {
  return {
    runId: "goal-run",
    request: {
      objective: "Ship the feature",
      acceptanceCriteria: ["tests pass"],
      verifyCommands: ["bun test"],
      maxSessions: 5,
    },
    input: {},
    verify: async () => [{ command: "bun test", exitCode: 0, output: "" }],
    onEvent: () => undefined,
    onSession: async () => undefined,
    ...extra,
  };
}

describe("runBackendGoal", () => {
  test("completes when verification passes and passes steered text and images to the session", async () => {
    const seen: { prompt: string; images: BackendImage[] }[] = [];
    const pending: BackendUserInput[] = [
      {
        text: "use the screenshot",
        images: [{ mediaType: "image/png", data: "QUJD" }],
      },
    ];
    const end = await runBackendGoal(
      specOf(),
      async (prompt, _signal, images) => {
        seen.push({ prompt, images });
        return { summary: "all done", messages: [] };
      },
      new AbortController().signal,
      { drain: () => pending.splice(0) },
    );
    expect(end).toEqual({
      type: "complete",
      summary: "all done",
      evidence: ["`bun test` passed"],
    });
    expect(seen[0]?.prompt).toContain("use the screenshot");
    expect(seen[0]?.images).toEqual([{ mediaType: "image/png", data: "QUJD" }]);
  });

  test("pauses on no_progress after three identical verification failures", async () => {
    let sessions = 0;
    const end = await runBackendGoal(
      specOf({
        verify: async () => [{ command: "bun test", exitCode: 1, output: "same error" }],
      }),
      async () => {
        sessions += 1;
        return { summary: `attempt ${sessions}`, messages: [] };
      },
      new AbortController().signal,
      { drain: () => [] },
    );
    expect(sessions).toBe(3);
    expect(end).toMatchObject({ type: "paused", reason: "no_progress", summary: "attempt 3" });
  });

  test("pauses on max_sessions when errors keep changing", async () => {
    let sessions = 0;
    const end = await runBackendGoal(
      specOf({
        request: {
          objective: "Fix tests",
          acceptanceCriteria: ["pass"],
          verifyCommands: ["bun test"],
          maxSessions: 2,
        },
        verify: async () => [{ command: "bun test", exitCode: 1, output: `err-${sessions}` }],
      }),
      async () => {
        sessions += 1;
        return { summary: `try ${sessions}`, messages: [] };
      },
      new AbortController().signal,
      { drain: () => [] },
    );
    expect(sessions).toBe(2);
    expect(end).toMatchObject({ type: "paused", reason: "max_sessions" });
  });

  test("stops immediately when the signal is aborted", async () => {
    const abort = new AbortController();
    abort.abort();
    const end = await runBackendGoal(
      specOf(),
      async () => {
        throw new Error("should not run");
      },
      abort.signal,
      { drain: () => [] },
    );
    expect(end).toEqual({ type: "error", error: "The run was cancelled" });
  });
});
