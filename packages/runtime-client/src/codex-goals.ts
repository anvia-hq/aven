import { createHash } from "node:crypto";
import type { Message } from "@anvia/core";

import type { FollowedGoal, GoalEnd, GoalSpec } from "./types";

const NO_PROGRESS_SESSIONS = 3;
const DEFAULT_SESSIONS = 20;

type Turn = { messages: Message[]; text: string };

export function followCodexGoal(
  goal: GoalSpec,
  run: (prompt: string, signal: AbortSignal, queue: string[]) => Promise<Turn>,
): FollowedGoal {
  const abort = new AbortController();
  const pending: string[] = [];
  const state = goal.state ?? { sessions: {} };
  const saveState = goal.saveState ?? (() => undefined);
  const done = drive().catch((error: unknown): GoalEnd => ({
    type: "error",
    error: error instanceof Error ? error.message : String(error),
  }));

  return {
    done,
    cancel: async () => {
      abort.abort(new Error("The run was cancelled"));
    },
    steer: async (prompt) => {
      if (abort.signal.aborted) return false;

      pending.push(textOf(prompt));
      return true;
    },
  };

  async function drive(): Promise<GoalEnd> {
    const max = goal.request.maxSessions ?? DEFAULT_SESSIONS;
    let completed = Object.keys(state.sessions).length;
    let streak = 0;
    let lastDigest = "";
    let summary = "The goal has not started.";

    while (completed < max) {
      abort.signal.throwIfAborted();
      const session = completed + 1;
      const extra = pending.splice(0).join("\n\n");
      const turn = await run(sessionPrompt(goal, session, summary, extra), abort.signal, pending);
      summary = turn.text || summary;
      await goal.onSession(session, turn.messages);
      completed += 1;
      state.sessions[String(session)] = { number: session, filed: true };
      saveState(state);
      const results = await goal.verify();
      const failing = results.filter((result) => result.exitCode !== 0);

      if (failing.length === 0) {
        return {
          type: "complete",
          summary,
          evidence: results.length
            ? results.map((result) => `\`${result.command}\` passed`)
            : ["The agent reported the goal done. No commands were set to check it."],
        };
      }

      const report = failing
        .map((result) => `${result.command} ${result.exitCode ?? "timed out"}\n${result.output}`)
        .join("\n");
      const digest = createHash("sha256").update(report).digest("hex").slice(0, 16);
      streak = digest === lastDigest ? streak + 1 : 1;
      lastDigest = digest;
      summary = `${summary}\n\nStill failing:\n${report}`;

      if (streak >= NO_PROGRESS_SESSIONS) {
        return {
          type: "paused",
          reason: "no_progress",
          summary,
          next: "The same checks failed three times. Change the approach, or ask the user.",
        };
      }
    }

    return {
      type: "paused",
      reason: "max_sessions",
      summary,
      next: "The goal used every session it was given.",
    };
  }
}

function sessionPrompt(goal: GoalSpec, session: number, previous: string, extra: string) {
  const lines = [
    `Objective: ${goal.request.objective}`,
    `Acceptance criteria:\n${goal.request.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`,
    `This is session ${session}. You have a fresh context. The workspace keeps what earlier sessions wrote.`,
    previous ? `Where the work stands:\n${previous}` : "",
    extra ? `The user added:\n${extra}` : "",
    "Do the next piece of work, then stop. Do not ask the user.",
  ];
  return lines.filter(Boolean).join("\n\n");
}

function textOf(prompt: unknown) {
  if (typeof prompt === "string") return prompt;

  if (typeof prompt === "object" && prompt !== null && "content" in prompt) {
    const content = prompt.content;

    if (typeof content === "string") return content;

    if (Array.isArray(content)) {
      return content
        .map((part) => (part && typeof part === "object" && part.type === "text" ? part.text : ""))
        .join("\n");
    }
  }

  return "";
}
