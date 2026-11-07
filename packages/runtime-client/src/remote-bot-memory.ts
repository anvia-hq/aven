import type {
  MemoryCompactionReplacePrefixResult,
  MemoryCompactionSnapshot,
  MemoryStore,
  Message,
} from "@anvia/core";
import type { BotMemoryCall } from "./types";

export function remoteBotMemory(replyId: string, call: BotMemoryCall): MemoryStore {
  return {
    load: async () => (await call({ replyId, op: "load" })) as Message[],
    append: async ({ runId, turn, messages }) => {
      await call({ replyId, op: "append", runId, turn, messages });
    },
    clear: async () => {
      throw new Error("A bot's conversation is not cleared from its runner");
    },
    compaction: {
      snapshot: async () => (await call({ replyId, op: "snapshot" })) as MemoryCompactionSnapshot,
      replacePrefix: async ({ runId, revision, messageCount, replacement }) =>
        (await call({
          replyId,
          op: "replacePrefix",
          runId,
          revision,
          messageCount,
          replacement,
        })) as MemoryCompactionReplacePrefixResult,
    },
  };
}
