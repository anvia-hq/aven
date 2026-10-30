import type { AnyTool, Message } from "@anvia/core";
import type { GoalAssessment, GoalDecision } from "@anvia/durable";
import { asRecord } from "@aven/agents/values";
import { createHash } from "node:crypto";

export type CommandResult = {
  command: string;
  /** Null when the command did not finish in time. */
  exitCode: number | null;
  output: string;
};

const COMMAND_TIMEOUT_MS = 300_000;
const OUTPUT_TAIL_CHARS = 1_500;

const tail = (text: string) =>
  text.length > OUTPUT_TAIL_CHARS ? `…${text.slice(-OUTPUT_TAIL_CHARS)}` : text;

// Runs the goal's verify commands in the thread's sandbox, one after another, so a later command
// can rely on an earlier one (a build before a test).
export function verifyWith(exec: AnyTool | undefined, commands: readonly string[]) {
  return async (): Promise<CommandResult[]> => {
    if (commands.length === 0) return [];
    if (!exec)
      throw new Error("The thread's sandbox is not running, so the goal cannot be checked");
    const results: CommandResult[] = [];
    for (const command of commands) {
      const result = asRecord(await exec.call({ command, timeoutMs: COMMAND_TIMEOUT_MS }));
      const exited = result.status === "exited";
      results.push({
        command,
        exitCode: exited ? Number(result.exitCode) : null,
        output: tail(
          [result.stdout, result.stderr, exited ? "" : "[timed out]"]
            .filter((part) => typeof part === "string" && part)
            .join("\n"),
        ),
      });
    }
    return results;
  };
}

function lastAssistantText(messages: readonly Message[]) {
  const last = messages.findLast((message) => message.role === "assistant");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return last.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

const digest = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

// The decision after a working session. Trusted code, not the model, says whether the goal is
// met: the verify commands, or, with none, the agent stopping on its own. Failing commands that
// fail the same way twice in a row count as no progress, which pauses the goal.
export async function assessGoal(
  { session }: GoalAssessment,
  verify: () => Promise<CommandResult[]>,
): Promise<GoalDecision> {
  const summary = lastAssistantText(session.roundMessages) || "The session produced no summary.";

  if (session.status === "exhausted") {
    return {
      status: "continue",
      summary,
      next: "The last session ran out of steps. Pick up where it stopped.",
      progressKey: `exhausted:${digest(summary)}`,
      evidence: [],
    };
  }

  const results = await verify();
  const failing = results.filter((result) => result.exitCode !== 0);
  if (failing.length === 0) {
    return {
      status: "complete",
      summary,
      next: "",
      progressKey: "complete",
      evidence: results.length
        ? results.map((result) => `\`${result.command}\` passed`)
        : ["The agent reported the goal done. No commands were set to check it."],
    };
  }

  const report = failing.map((result) => `${outcomeText(result)}:\n${result.output}`);
  return {
    status: "continue",
    summary,
    next: `Make these commands pass:\n\n${report.join("\n\n")}`,
    progressKey: digest(report.join("\n")),
    evidence: failing.map(outcomeText),
  };
}

// How a command that did not pass ended, e.g. "`bun test` exited 1".
function outcomeText(result: CommandResult) {
  const ended = result.exitCode === null ? "timed out" : `exited ${result.exitCode}`;
  return `\`${result.command}\` ${ended}`;
}
