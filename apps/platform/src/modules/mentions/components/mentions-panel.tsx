import { IconAt } from "@tabler/icons-react";

import { Button } from "@aven/ui/button";

import type { Mention } from "../types";
import { MentionRow } from "./mention-row";

type Props = {
  mentions: Mention[];
  unread: number;
  onMarkAllRead: () => void;
  onOpen: () => void;
};

export function MentionsPanel({ mentions, unread, onMarkAllRead, onOpen }: Props) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Mentions</h2>
          <span className="font-mono text-xs text-muted-foreground">· {unread} unread</span>
        </div>
        <Button variant="outline" size="xs" disabled={unread === 0} onClick={onMarkAllRead}>
          Mark all read
        </Button>
      </div>
      {mentions.length === 0 ? (
        <div className="flex items-start gap-4 px-4 py-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <IconAt className="size-6" />
          </div>
          <div>
            <p className="text-sm font-medium">No mentions yet</p>
            <p className="text-sm text-muted-foreground">
              When someone mentions you in a thread, it will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex max-h-96 flex-col divide-y overflow-y-auto">
          {mentions.map((mention) => (
            <MentionRow key={mention.threadId} mention={mention} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
