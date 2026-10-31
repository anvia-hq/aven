import type { MemoryCompactionMessage, MemoryScope, MemoryStore, Message } from "@anvia/core";
import type { BotMemoryParams } from "@aven/protocol/runtime-wire";

// What a runner asks of a bot's conversation, answered from the store for one bot and its owner.
// The scope is the control plane's own record of the reply, never the runner's: whatever the
// runner names, it reads and adds to that bot's conversation and no other's (decision 0059).
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
