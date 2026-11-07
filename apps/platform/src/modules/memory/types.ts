export type {
  MemoryEventView as MemoryEvent,
  MemoryNoteView as MemoryNote,
} from "@aven/protocol/memory";
export type { MemoryScope } from "@aven/protocol/memory";

export type MemoryFolder =
  | { scope: "personal" }
  | { scope: "project"; projectId: string }
  | { scope: "bot"; botId: string };

export type FolderChoice = { key: string; label: string; folder: MemoryFolder };
