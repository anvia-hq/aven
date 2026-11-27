import { IconAt } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@aven/ui/popover";

import { useMentions } from "../hooks/use-mentions";
import { MentionsPanel } from "./mentions-panel";

export function MentionsButton() {
  const [open, setOpen] = useState(false);
  const { mentions, unread, markAllRead } = useMentions();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative size-9 rounded-full bg-muted/40 hover:bg-muted/70 md:size-7"
            aria-label={unread > 0 ? `Mentions, ${unread} unread` : "Mentions"}
          />
        }
      >
        <IconAt />
        {unread > 0 && (
          <span className="absolute top-1 right-1 size-2 rounded-full bg-primary" aria-hidden />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-[calc(100vw-1.5rem)] max-w-96 gap-0 p-0"
      >
        <PopoverArrow />
        <MentionsPanel
          mentions={mentions}
          unread={unread}
          onMarkAllRead={markAllRead}
          onOpen={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
