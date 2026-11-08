import { useSyncExternalStore } from "react";

import type { BotsWorkingStore } from "../types";

const listeners = new Set<() => void>();

const WORKING_PATH = "/api/bots/working";

let working: ReadonlySet<string> = new Set();
let source: EventSource | null = null;

function announce() {
  for (const listener of listeners) listener();
}

function receive(event: MessageEvent) {
  const data: unknown = event.data;
  if (typeof data !== "string") return;
  let ids: unknown;
  try {
    ids = JSON.parse(data);
  } catch {
    return;
  }
  if (!Array.isArray(ids)) return;
  working = new Set(ids.filter((id): id is string => typeof id === "string"));
  announce();
}

function connect(): EventSource {
  const opened = new EventSource(WORKING_PATH);
  opened.onmessage = receive;
  return opened;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!source) source = connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    source?.close();
    source = null;
  };
}

function snapshot(): ReadonlySet<string> {
  return working;
}

export const botsWorkingStore: BotsWorkingStore = { subscribe, snapshot };

export function useBotsWorking(): ReadonlySet<string> {
  return useSyncExternalStore(botsWorkingStore.subscribe, botsWorkingStore.snapshot);
}
