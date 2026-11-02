import { mentionToken } from "@aven/protocol/events";

import type { MessageMention } from "./types";

/** A file or a skill a message mentions, without where its token is. */
export type Mentionable = Pick<MessageMention, "type" | "name">;

/**
 * `/` also offers commands, which a skill's name cannot be (a name has no slash): picking one puts
 * its text in the composer as a chip, and sending a message that is only that chip runs the command
 * instead of sending it (decision 0097).
 */
export const COMPACT_COMMAND = "/compact";

/** What a mention token is drawn from: its kind and name, kept on the composer's entity. */
export function mentionOf(triggerId: string, id: string): Mentionable | undefined {
  if (id === COMPACT_COMMAND) return undefined;
  return triggerId === "file" || triggerId === "skill" ? { type: triggerId, name: id } : undefined;
}

// A mention inside Markdown travels as inline code that starts with this character, which the
// reader never types, and `mentionCode` draws it back as the chip.
export const MENTION_MARK = "\uE000";

/**
 * A message's text with each mention's token swapped for a marker Markdown leaves alone, so the
 * text can be drawn as Markdown and the chips still land where they were typed. A mention whose
 * token is not where it says is left as the text it covers.
 */
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
