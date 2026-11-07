import type { RunEnding } from "../runs/types";
import type { createThreadWatcher } from "./watcher";

export type Watcher = { botId: string; userId: string };

export type WatchedRun = number | null;

export type NoteEnding = RunEnding | { outcome: "unknown" };

export type ThreadWatcher = ReturnType<typeof createThreadWatcher>;
