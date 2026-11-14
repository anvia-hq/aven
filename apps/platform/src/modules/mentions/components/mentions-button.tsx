import { At } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@aven/ui/popover";

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
            className="relative size-9 md:size-7"
            aria-label={unread > 0 ? `Mentions, ${unread} unread` : "Mentions"}
          />
        }
      >
        <At />
        {unread > 0 && (
          <span className="absolute top-1 right-1 size-2 rounded-full bg-primary" aria-hidden />
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 gap-0 p-0">
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
