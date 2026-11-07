import { useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api";

import type { MemoryEvent } from "../types";

export function useMemoryHistory(open: boolean) {
  const [events, setEvents] = useState<MemoryEvent[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let current = true;
    api<MemoryEvent[]>("/memory/history")
      .then((found) => current && setEvents(found))
      .catch((failure: unknown) => {
        if (!current) return;
        toast.add({
          title: "Could not load history",
          description: errorMessage(failure),
          type: "error",
        });
        setEvents([]);
      });
    return () => {
      current = false;
      setEvents(null);
    };
  }, [open]);

  return { events: events ?? [], loaded: events !== null };
}
