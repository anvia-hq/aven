import { mentionToken } from "@aven/protocol/events";

import type { MessageMention } from "./types";

export type Mentionable = Pick<MessageMention, "type" | "name">;

export const COMPACT_COMMAND = "/compact";

export function mentionOf(triggerId: string, id: string): Mentionable | undefined {
  if (id === COMPACT_COMMAND) return undefined;
  return triggerId === "file" || triggerId === "skill" ? { type: triggerId, name: id } : undefined;
}

export const MENTION_MARK = "\uE000";

export function markMentions(text: string, mentions: MessageMention[] = []) {
  let result = "";
  let at = 0;
  for (const mention of [...mentions].sort((a, b) => a.from - b.from)) {
    if (mention.from < at || text.slice(mention.from, mention.to) !== mentionToken(mention)) {
      continue;
    }
    if (mention.name.includes("`")) continue;
    result += `${text.slice(at, mention.from)}\`${MENTION_MARK}${mention.type}:${mention.name}\``;
    at = mention.to;
  }
  return result + text.slice(at);
}
