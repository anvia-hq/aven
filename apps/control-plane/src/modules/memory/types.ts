import type { MemoryScope } from "@aven/protocol/memory";

export type MemoryCaller = { owner: MemoryOwner; actor: MemoryActor; writable: boolean };

export type MemoryOwner = { userId: string; projectId?: string; botId?: string };

export type MemoryPlace = {
  userId: string;
  scope: MemoryScope;
  projectId?: string;
  botId?: string;
};

export type MemoryActor =
  | { source: "person" }
  | { source: "thread"; threadId: string }
  | { source: "bot"; botId: string };
