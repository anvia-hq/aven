import type { MemoryCompactionMessage, MemoryScope, MemoryStore, Message } from "@anvia/core";
import type { BotMemoryParams } from "@aven/protocol/types";

export function answerBotMemory(store: MemoryStore, scope: MemoryScope) {
  return async (params: BotMemoryParams): Promise<unknown> => {
    switch (params.op) {
      case "load":
        return store.load({ scope });
      case "append": {
        const { runId, turn, messages } = params;
        await store.append({ scope, runId, turn, messages: messages as Message[] });
        return null;
      }
      case "snapshot":
        return compactionOf(store).snapshot({ scope });
      case "replacePrefix": {
        const { runId, revision, messageCount, replacement } = params;
        return compactionOf(store).replacePrefix({
          scope,
          runId,
          revision,
          messageCount,
          replacement: replacement as MemoryCompactionMessage,
        });
      }
      default:
        throw new Error(`Unknown operation: ${params satisfies never}`);
    }
  };
}

function compactionOf(store: MemoryStore) {
  if (!store.compaction) throw new Error("The bot's conversation cannot be summarized here");

  return store.compaction;
}
