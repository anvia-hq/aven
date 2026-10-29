import type {
  MemoryAppendOptions,
  MemoryClearOptions,
  MemoryLoadOptions,
  MemoryStore,
  Message,
} from "@anvia/core";
import type { MemoryCallMethod } from "@aven/protocol/runtime-wire";

export type Call = (method: MemoryCallMethod, params: unknown) => Promise<unknown>;

// The conversation lives in the control plane. A runtime keeps none: every load and append is a
// call home, scoped to the run by the control plane (the scope the agent passes is ignored there),
// so a replaced or restarted runtime loses nothing. It offers no compaction or inspection.
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
  };
}
