import type { GoalEnd } from "./durable-runs";

// What the agent is told when its goal is over, so it reports in the thread in its own words. It
// is part of the conversation the agent continues from, so it reads as a note from Aven.
export function goalReport(objective: string, end: Exclude<GoalEnd, { type: "error" }>) {
  const lines = [`[Aven] The goal you started is over. Objective: ${objective}`];
  if (end.type === "complete") {
    lines.push(
      `It is complete. ${end.summary}`,
      `Checked: ${end.evidence.join("; ")}`,
      "Tell the user what was done, briefly, and anything they should look at.",
    );
  } else {
    lines.push(
      `It stopped before it was done (${reasons[end.reason] ?? end.reason}). ${end.summary}`,
      `What was left: ${end.next}`,
      "Tell the user where it stands and what you need from them to continue.",
    );
  }
  lines.push("Do not start another goal in this reply.");
  return lines.join("\n\n");
}

const reasons: Record<string, string> = {
  blocked: "the work is blocked",
  deadline: "it ran past its deadline",
  max_sessions: "it used all its sessions",
  max_model_turns: "it used all its model turns",
  max_tokens: "it used all its tokens",
  no_progress: "the last sessions made no progress",
  session_failed: "a session failed",
  requested: "it was paused",
};
