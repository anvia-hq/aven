import { useState } from "react";

import { Badge } from "@aven/ui/badge";
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

import { useVariableHistory } from "../hooks/use-variable-history";
import type { VariableEvent, VariableScope } from "../types";

const VERBS: Record<VariableEvent["action"], string> = {
  created: "created",
  updated: "changed",
  removed: "removed",
};

function EventRow({ event }: { event: VariableEvent }) {
  return (
    <li className="flex flex-col gap-0.5 border-b py-2 text-sm">
      <p>
        <span className="font-medium">{event.actor ?? "Someone"}</span> {VERBS[event.action]}{" "}
        <span className="font-mono">{event.name}</span>
        {event.secret && (
          <>
            {" "}
            <Badge variant="secondary">Secret</Badge>
          </>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {timeAgo(event.createdAt, true)}
        {event.source === "agent" && " · asked for by the agent"}
      </p>
    </li>
  );
}

export function VariableHistoryDialog({ scope }: { scope: VariableScope }) {
  const [open, setOpen] = useState(false);
  const { events, loaded } = useVariableHistory(scope, open);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="xs" />}>History</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Who created, changed or removed each variable. The values are never kept.
          </DialogDescription>
        </DialogHeader>
        {loaded && events.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing has been changed yet.</p>
        )}
        {events.length > 0 && (
          <ul
            aria-label="Variable history"
            className="flex max-h-96 flex-col overflow-y-auto border-t"
          >
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
