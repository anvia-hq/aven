import { BookOpen, File } from "@mynaui/icons-react";
import { mentionToken } from "@aven/protocol/events";
import type { ComponentProps } from "react";

import type { MessageMention } from "../types";

type Mentionable = Pick<MessageMention, "type" | "name">;

/** A file or a skill the user mentioned, as its token is shown in the composer and the thread. */
export function MentionChip({ type, name }: Mentionable) {
  const Icon = type === "file" ? File : BookOpen;
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded bg-code/10 px-1 py-0.5 font-mono text-[0.85em] font-medium text-code"
      title={type === "file" ? `File ${name}` : `Skill ${name}`}
      data-mention={type}
    >
      <Icon className="size-3.5 self-center" />
      {name}
    </span>
  );
}

// A mention inside Markdown travels as inline code that starts with this character, which the
// reader never types, and `mentionCode` draws it back as the chip.
const MARK = "\uE000";

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
    result += `${text.slice(at, mention.from)}\`${MARK}${mention.type}:${mention.name}\``;
    at = mention.to;
  }
  return result + text.slice(at);
}

/** The `code` element of Markdown with `markMentions`' markers drawn as chips. */
export function mentionCode({
  node: _node,
  children,
  ...props
}: ComponentProps<"code"> & { node?: unknown }) {
  if (typeof children === "string" && children.startsWith(MARK)) {
    const [type, ...name] = children.slice(MARK.length).split(":");
    return <MentionChip type={type === "file" ? "file" : "skill"} name={name.join(":")} />;
  }
  return <code {...props}>{children}</code>;
}
