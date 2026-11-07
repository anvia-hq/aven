import type { MemoryNoteView as MemoryNote } from "@aven/protocol/types";

export type {
  MemoryEventView as MemoryEvent,
  MemoryNoteView as MemoryNote,
} from "@aven/protocol/types";
export type { MemoryScope } from "@aven/protocol/types";

export type MemoryFolder =
  | { scope: "personal" }
  | { scope: "project"; projectId: string }
  | { scope: "bot"; botId: string };

export type FolderChoice = { key: string; label: string; folder: MemoryFolder };

export type FolderSection = FolderChoice & { description: string; notes: MemoryNote[] };
