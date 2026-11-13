import { useState } from "react";

import { Button } from "@aven/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aven/ui/dialog";
import { timeAgo } from "@/lib/format";

import { useMemoryHistory } from "../hooks/use-memory-history";
import type { MemoryEvent } from "../types";

const VERBS: Record<MemoryEvent["action"], string> = {
  created: "saved",
  updated: "changed",
  removed: "deleted",
  renamed: "renamed",
};

const WHO: Record<MemoryEvent["source"], string> = {
  person: "You",
  thread: "A thread's agent",
  bot: "A bot",
};

function EventRow({
  event,
  folderOf,
}: {
  event: MemoryEvent;
  folderOf: (event: MemoryEvent) => string;
}) {
  return (
    <li className="flex flex-col gap-0.5 border-b py-2 text-sm">
      <p>
        <span className="font-medium">{WHO[event.source]}</span> {VERBS[event.action]}{" "}
        {event.from && (
          <>
            <span className="font-mono">{event.from}</span> to{" "}
          </>
        )}
        <span className="font-mono">{event.name}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {folderOf(event)} · {timeAgo(event.at, true)}
      </p>
    </li>
  );
}

export function MemoryHistoryDialog({ folderOf }: { folderOf: (event: MemoryEvent) => string }) {
  const [open, setOpen] = useState(false);
  const { events, loaded } = useMemoryHistory(open);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>History</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Who saved, changed or deleted each note, latest first.
          </DialogDescription>
        </DialogHeader>
        {loaded && events.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing has been changed yet.</p>
        )}
        {events.length > 0 && (
          <ul
            aria-label="Memory history"
            className="flex max-h-96 flex-col overflow-y-auto border-t"
          >
            {events.map((event) => (
              <EventRow key={event.id} event={event} folderOf={folderOf} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
