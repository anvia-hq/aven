import { BookOpen, File } from "@mynaui/icons-react";
import { mentionToken } from "@aven/protocol/events";
import { Fragment, type ReactNode } from "react";

import type { MessageMention } from "../types";

type Mentionable = Pick<MessageMention, "type" | "name">;

/** A file or a skill the user mentioned, as its token is shown in the composer and the thread. */
export function MentionChip({ type, name }: Mentionable) {
  const Icon = type === "file" ? File : BookOpen;
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded bg-code/10 px-1 py-0.5 font-mono text-[0.85em] text-code"
      title={type === "file" ? `File ${name}` : `Skill ${name}`}
      data-mention={type}
    >
      <Icon className="size-3.5 self-center" />
      {name}
    </span>
  );
}

/**
 * A message's text with its mentions drawn as chips. A mention whose token is not where it says is
 * left as the text it covers.
 */
export function MentionedText({
  text,
  mentions = [],
}: {
  text: string;
  mentions?: MessageMention[];
}) {
  const pieces: ReactNode[] = [];
  let at = 0;
  for (const mention of [...mentions].sort((a, b) => a.from - b.from)) {
    if (mention.from < at || text.slice(mention.from, mention.to) !== mentionToken(mention)) {
      continue;
    }
    pieces.push(text.slice(at, mention.from));
    pieces.push(<MentionChip key={mention.from} type={mention.type} name={mention.name} />);
    at = mention.to;
  }
  pieces.push(text.slice(at));
  return pieces.map((piece, index) => <Fragment key={index}>{piece}</Fragment>);
}
