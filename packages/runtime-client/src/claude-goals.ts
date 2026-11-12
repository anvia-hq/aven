import { createHash } from "node:crypto";

import type { Message } from "@anvia/core";

import type { GoalEnd, GoalSpec } from "./types";

const DEFAULT_GOAL_SESSIONS = 20;
const NO_PROGRESS_SESSIONS = 3;

export async function runClaudeGoal(
  spec: GoalSpec,
  session: (
    prompt: string,
    signal: AbortSignal,
  ) => Promise<{ summary: string; messages: Message[] }>,
  signal: AbortSignal,
  steers: { drain(): string[] },
): Promise<GoalEnd> {
  const max = spec.request.maxSessions ?? DEFAULT_GOAL_SESSIONS;
  const state = spec.state ?? { sessions: {} };
  let next = Object.values(state.sessions).reduce(
    (highest, item) => Math.max(highest, item.number),
    0,
  );
  let previous = "";
  let stagnant = "";
  let stagnantCount = 0;
  while (next < max) {
    if (signal.aborted) return { type: "error", error: "The run was cancelled" };

    next += 1;
    const extra = steers.drain();
    const lines = [
      spec.request.objective,
      `Acceptance criteria:\n${spec.request.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`,
    ];

    if (previous) lines.push(previous);

    if (extra.length > 0) lines.push(`The person added:\n${extra.join("\n")}`);

    const result = await session(lines.join("\n\n"), signal);
    await spec.onSession(next, result.messages);
    state.sessions[`session-${next}`] = { number: next, filed: true };
    spec.saveState?.(state);
    const results = await spec.verify();
    const failing = results.filter((item) => item.exitCode !== 0);
    const summary = result.summary || "The session produced no summary.";

    if (failing.length === 0) {
      const evidence = results.length
        ? results.map((item) => `\`${item.command}\` passed`)
        : ["The agent reported the goal done. No commands were set to check it."];
      return { type: "complete", summary, evidence };
    }

    const report = failing
      .map((item) => `\`${item.command}\` exited ${item.exitCode ?? "timeout"}\n${item.output}`)
      .join("\n\n");
    const digest = createHash("sha256").update(report).digest("hex").slice(0, 16);

    if (digest === stagnant) stagnantCount += 1;
    else {
      stagnant = digest;
      stagnantCount = 1;
    }

    previous = `The last session did not finish. Make these commands pass:\n\n${report}`;

    if (stagnantCount >= NO_PROGRESS_SESSIONS) {
      return { type: "paused", reason: "no_progress", summary, next: previous };
    }
  }
  return {
    type: "paused",
    reason: "max_sessions",
    summary: "The goal used every session.",
    next: previous || "Continue the objective.",
  };
}
