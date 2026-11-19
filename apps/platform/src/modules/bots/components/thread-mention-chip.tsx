import { Link } from "@tanstack/react-router";
import { cn } from "cn";

import { bubbleInk, bubbleStyle } from "../bubble-tint";

import { ThreadMentionMark } from "./thread-mention-mark";

type Props = { id: string; title: string; link?: boolean; color?: string };

const CHIP =
  "inline-flex h-fit max-w-64 items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 align-middle leading-none font-medium text-[0.9em]";

export function ThreadMentionChip({ id, title, link = false, color }: Props) {
  const content = (
    <>
      <ThreadMentionMark id={id} className="size-3.5 shrink-0" />
      <span className="truncate">{title}</span>
    </>
  );

  if (!link) {
    return (
      <span
        className={cn(CHIP, color ? bubbleInk(color) : "bg-muted text-foreground")}
        style={bubbleStyle(color)}
        title={`Thread: ${title}`}
        data-mention="thread"
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      to="/threads/$threadId"
      params={{ threadId: id }}
      className={`${CHIP} bg-muted text-foreground hover:bg-accent`}
      title={`Open the thread: ${title}`}
      data-mention="thread"
    >
      {content}
    </Link>
  );
}
