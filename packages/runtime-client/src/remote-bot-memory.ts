import type {
  MemoryCompactionReplacePrefixResult,
  MemoryCompactionSnapshot,
  MemoryStore,
  Message,
} from "@anvia/core";
import type { BotMemoryParams } from "@aven/protocol/runtime-wire";

/** Asks the control plane about the conversation of the bot the reply is for. */
export type BotMemoryCall = (params: BotMemoryParams) => Promise<unknown>;

// A bot's conversation is the control plane's (decision 0059), so the bot's agent, which runs here,
// reads and writes it through calls. The control plane answers for the bot of the live reply and
// takes no scope from this side, so what is asked here only says what to do. Its answers are
// Anvia's own values, taken as they are, like the other answers of the control plane.
export function remoteBotMemory(replyId: string, call: BotMemoryCall): MemoryStore {
  return {
    load: async () => (await call({ replyId, op: "load" })) as Message[],
    append: async ({ runId, turn, messages }) => {
      await call({ replyId, op: "append", runId, turn, messages });
    },
    // A runner cannot wipe a chat; nothing in a bot's run asks it to.
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
