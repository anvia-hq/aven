import { ChatDots } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";

type Props = { id: string; title: string; link?: boolean };

const CHIP =
  "inline-flex h-fit max-w-64 items-center gap-1 rounded-full bg-muted py-0.5 pr-2 pl-1.5 align-middle leading-none font-medium text-[0.9em]";

export function ThreadMentionChip({ id, title, link = false }: Props) {
  const content = (
    <>
      <ChatDots className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{title}</span>
    </>
  );
  if (!link) {
    return (
      <span className={CHIP} title={`Thread: ${title}`} data-mention="thread">
        {content}
      </span>
    );
  }
  return (
    <Link
      to="/threads/$threadId"
      params={{ threadId: id }}
      className={`${CHIP} hover:bg-accent`}
      title={`Open the thread: ${title}`}
      data-mention="thread"
    >
      {content}
    </Link>
  );
}
