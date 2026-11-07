import { useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api";

import { variablesPath, type VariableEvent, type VariableScope } from "../types";

export function useVariableHistory(scope: VariableScope, open: boolean) {
  const [events, setEvents] = useState<VariableEvent[] | null>(null);
  const path = `${variablesPath(scope)}/history`;

  useEffect(() => {
    if (!open) return;
    let current = true;
    api<VariableEvent[]>(path)
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
  }, [open, path]);

  return { events: events ?? [], loaded: events !== null };
}
