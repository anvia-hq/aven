import { useSyncExternalStore } from "react";

import { afterOpened, afterWorking, emptyRail } from "../bot-rail";
import type { BotRailState, BotRailStore } from "../types";
import { botsWorkingStore } from "./use-bots-working";

const listeners = new Set<() => void>();

let rail: BotRailState = emptyRail;
let stopWatching: (() => void) | null = null;

function announce(): void {
  for (const listener of listeners) listener();
}

function apply(next: BotRailState): void {
  if (next === rail) return;

  rail = next;
  announce();
}

function receive(): void {
  apply(afterWorking(rail, botsWorkingStore.snapshot()));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (!stopWatching) {
    stopWatching = botsWorkingStore.subscribe(receive);
    receive();
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size > 0) return;

    stopWatching?.();
    stopWatching = null;
  };
}

function snapshot(): BotRailState {
  return rail;
}

function markOpened(id: string): void {
  apply(afterOpened(rail, id, botsWorkingStore.snapshot()));
}

function reset(): void {
  apply(emptyRail);
}

export const botRailStore: BotRailStore = { subscribe, snapshot, markOpened, reset };

export function useBotRail(mainId: string | undefined): readonly string[] {
  const { shown } = useSyncExternalStore(botRailStore.subscribe, botRailStore.snapshot);

  return mainId === undefined ? shown : shown.filter((each) => each !== mainId);
}
