import type {
  MemoryAppendOptions,
  MemoryClearOptions,
  MemoryCompactionReplacePrefixOptions,
  MemoryCompactionReplacePrefixResult,
  MemoryCompactionSnapshot,
  MemoryLoadOptions,
  MemoryStore,
  Message,
} from "@anvia/core";
import type { MemoryCallMethod } from "@aven/protocol/runtime-wire";

export type Call = (method: MemoryCallMethod, params: unknown) => Promise<unknown>;

// The conversation lives in the control plane. A runtime keeps none: every load and append is a
// call home, scoped to the run by the control plane (the scope the agent passes is ignored there),
// so a replaced or restarted runtime loses nothing. Compaction (summarizing old history) is a pair
// of calls home too; it offers no inspection.
export function createRemoteMemory(call: Call, runId: string): MemoryStore {
  return {
    async load(_options: MemoryLoadOptions) {
      return (await call("memory.load", { runId })) as Message[];
    },
    async append(options: MemoryAppendOptions) {
      await call("memory.append", { runId, turn: options.turn, messages: options.messages });
    },
    async clear(_options: MemoryClearOptions) {
      await call("memory.clear", { runId });
    },
    compaction: {
      async snapshot() {
        return (await call("memory.snapshot", { runId })) as MemoryCompactionSnapshot;
      },
      async replacePrefix(options: MemoryCompactionReplacePrefixOptions) {
        const { revision, messageCount, replacement } = options;
        return (await call("memory.replacePrefix", {
          runId,
          revision,
          messageCount,
          replacement,
        })) as MemoryCompactionReplacePrefixResult;
      },
    },
  };
}
