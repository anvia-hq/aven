import { toast } from "@/components/toast";

import type { OutgoingMessage, RunSelection } from "./types";

export const FIRST_PROMPT_LIFETIME_MS = 120_000;
export const FIRST_PROMPT_LIMIT = 5;

interface WaitingPrompt {
  message: OutgoingMessage;
  selection: RunSelection;
  handedOverAt: number;
}

const waiting = new Map<string, WaitingPrompt>();

function reportDropped({ message }: WaitingPrompt) {
  toast.add({
    title: "Your first prompt was not sent",
    description: message.prompt,
    type: "error",
  });
}

function dropFirstPrompt(threadId: string) {
  const first = waiting.get(threadId);

  if (!first) return;

  waiting.delete(threadId);
  reportDropped(first);
}

function dropStaleFirstPrompts(now: number) {
  for (const [threadId, first] of waiting) {
    if (now - first.handedOverAt >= FIRST_PROMPT_LIFETIME_MS) dropFirstPrompt(threadId);
  }
}

function dropOldestFirstPrompt() {
  let oldest: [string, WaitingPrompt] | undefined;
  for (const entry of waiting) {
    if (!oldest || entry[1].handedOverAt < oldest[1].handedOverAt) oldest = entry;
  }

  if (oldest) dropFirstPrompt(oldest[0]);
}

export function handOverFirstPrompt(
  threadId: string,
  message: OutgoingMessage,
  selection: RunSelection,
) {
  const now = Date.now();
  dropStaleFirstPrompts(now);

  if (!waiting.has(threadId)) {
    while (waiting.size >= FIRST_PROMPT_LIMIT) dropOldestFirstPrompt();
  }

  waiting.set(threadId, { message, selection, handedOverAt: now });
}

export function takeFirstPrompt(threadId: string) {
  const first = waiting.get(threadId);

  if (!first) return;

  waiting.delete(threadId);

  if (Date.now() - first.handedOverAt >= FIRST_PROMPT_LIFETIME_MS) {
    reportDropped(first);
    return;
  }

  return first;
}
