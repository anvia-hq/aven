import { parseDriverPrompt } from "@aven/protocol/drivers";

import type { Addressing, AddressingScores, PersonMention } from "./types";

export const AGENT_HANDLE = "@agent";
export const ACT_BELOW_PERSON = 0.6;
export const ACT_ABOVE_AGENT = 0.4;

const PERSON_MENTION = /@\[([^\]\n]{1,80})\]\(user:([\w-]{1,64})\)/g;
const AGENT_WORD = /(^|[^\w@])@agent\b/i;

export function personMentions(text: string): PersonMention[] {
  const seen = new Map<string, PersonMention>();
  for (const [, name, id] of text.matchAll(PERSON_MENTION)) {
    if (name && id && !seen.has(id)) seen.set(id, { id, name });
  }
  return [...seen.values()];
}

export function spoken(text: string) {
  return parseDriverPrompt(text).text.replace(PERSON_MENTION, (_, name: string) => `@${name}`);
}

export function namesAgent(text: string) {
  return AGENT_WORD.test(text.replace(PERSON_MENTION, " "));
}

export function fallbackAddressing(text: string): Addressing {
  const mentioned = personMentions(text).length > 0;
  return { agentAction: !mentioned || namesAgent(text), by: "fallback" };
}

export function addressingFrom(scores: AddressingScores): Addressing {
  const toPerson = scores.toPerson >= ACT_BELOW_PERSON && scores.toAgent <= ACT_ABOVE_AGENT;
  return { agentAction: !toPerson, by: "model" };
}
