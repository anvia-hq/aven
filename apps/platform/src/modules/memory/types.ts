export type {
  MemoryEventView as MemoryEvent,
  MemoryNoteView as MemoryNote,
} from "@aven/protocol/memory";
export type { MemoryScope } from "@aven/protocol/memory";

/** A folder of the person's memory: a scope, with its project or bot. */
export type MemoryFolder =
  | { scope: "personal" }
  | { scope: "project"; projectId: string }
  | { scope: "bot"; botId: string };

/** A folder the person can write a note in, with what to call it. */
export type FolderChoice = { key: string; label: string; folder: MemoryFolder };
