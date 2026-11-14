import { At, DotsVertical } from "@mynaui/icons-react";

import { Button } from "@aven/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aven/ui/dropdown-menu";

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
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium text-muted-foreground">Mentions</h2>
        <div className="flex items-center gap-1">
          <span className="font-mono text-sm text-muted-foreground">{unread} Unread</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" className="size-6" aria-label="More" />
              }
            >
              <DotsVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={unread === 0} onClick={onMarkAllRead}>
                Mark all as read
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {mentions.length === 0 ? (
        <div className="flex items-start gap-4 px-4 py-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <At className="size-6" />
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
