import { Link } from "@tanstack/react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@aven/ui/avatar";
import { initials, shortTimeAgo } from "@/lib/format";

import type { Mention } from "../types";

type Props = { mention: Mention; onOpen: () => void };

export function MentionRow({ mention, onOpen }: Props) {
  const name = mention.authorName ?? "Someone";
  return (
    <Link
      to="/threads/$threadId"
      params={{ threadId: mention.threadId }}
      onClick={onOpen}
      className="flex gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
    >
      <Avatar size="sm" className="mt-0.5">
        {mention.authorImage && <AvatarImage src={mention.authorImage} alt="" />}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-medium">{name}</span>
          <span className="text-muted-foreground"> mentioned you in </span>
          <span className="font-medium">{mention.title}</span>
        </p>
        {mention.excerpt && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{mention.excerpt}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs text-muted-foreground">{shortTimeAgo(mention.createdAt)}</span>
        {!mention.read && (
          <span className="size-2 rounded-full bg-primary" role="img" aria-label="Unread" />
        )}
      </div>
    </Link>
  );
}
