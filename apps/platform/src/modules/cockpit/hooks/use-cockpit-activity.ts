import { useEffect, useRef, useSyncExternalStore } from "react";

import { toast } from "@/components/toast";

import { refreshCockpit } from "./use-bot-changes";
import type { CockpitActivity } from "../types";

const ACTIVITY_PATH = "/api/cockpit/activity";

type State = { latest: CockpitActivity | null; count: number };

let state: State = { latest: null, count: 0 };
let source: EventSource | undefined;
const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

function receive(event: MessageEvent) {
  const data: unknown = event.data;

  if (typeof data !== "string") return;

  let activity: CockpitActivity;
  try {
    activity = JSON.parse(data) as CockpitActivity;
  } catch {
    return;
  }

  state = { latest: activity, count: state.count + 1 };
  announce();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (!source) {
    source = new EventSource(ACTIVITY_PATH);
    source.onmessage = receive;
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size > 0) return;

    source?.close();
    source = undefined;
  };
}

const snapshot = () => state;

export function useCockpitActivity() {
  const { latest, count } = useSyncExternalStore(subscribe, snapshot, snapshot);
  const told = useRef(count);

  useEffect(() => {
    if (!latest || count === told.current) return;

    told.current = count;
    toast.add({
      title: `${latest.source} ${latest.summary}`,
      type: latest.changed ? "success" : undefined,
    });

    if (latest.changed) refreshCockpit();
  }, [latest, count]);
}
