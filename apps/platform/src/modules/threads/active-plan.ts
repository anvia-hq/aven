import { systemNoteOf } from "@aven/protocol/system-notes";
import { latestPlanOf } from "@aven/protocol/timeline";

import type { ChatMessage, PlanTask } from "./types";

function isPersonMessage(message: ChatMessage): boolean {
  if (message.role !== "user") return false;

  const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  return systemNoteOf(text) === null;
}

export function activePlanOf(
  messages: readonly ChatMessage[],
  running: boolean,
  hasPending = false,
): PlanTask[] | null {
  if (hasPending) return null;

  let start = messages.length;

  while (start > 0 && !isPersonMessage(messages[start - 1]!)) {
    start -= 1;
  }

  const turnParts = messages
    .slice(start)
    .flatMap((message) => (message.role === "assistant" ? message.parts : []));
  const plan = latestPlanOf(turnParts);

  if (!plan || plan.length === 0) return null;

  const allCompleted = plan.every((task) => task.status === "completed");

  if (!running && allCompleted) return null;

  return plan;
}
