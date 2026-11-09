import { mentionToken } from "@aven/protocol/events";

import type { Mentionable, MentionPerson, MessageMention } from "./types";

export const COMPACT_COMMAND = "/compact";

export const PERSON_PREFIX = "user:";

export const AGENT_ENTITY = "agent:self";

export const AGENT_HANDLE = "@agent";

const PERSON_TOKEN = /@\[([^\]\n`]{1,80})\]\(user:[\w-]{1,64}\)/g;

export const personToken = ({ id, name }: Pick<MentionPerson, "id" | "name">) =>
  `@[${
    name
      .replace(/[\]\n`]/g, " ")
      .trim()
      .slice(0, 80) || "Teammate"
  }](${PERSON_PREFIX}${id})`;

export const personIdOf = (entityId: string) =>
  entityId.startsWith(PERSON_PREFIX) ? entityId.slice(PERSON_PREFIX.length) : undefined;

export function mentionOf(triggerId: string, id: string): Mentionable | undefined {
  if (id === COMPACT_COMMAND || id === AGENT_ENTITY || personIdOf(id) !== undefined) {
    return undefined;
  }
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
  return (result + text.slice(at)).replace(
    PERSON_TOKEN,
    (_, name: string) => `\`${MENTION_MARK}person:${name}\``,
  );
}
