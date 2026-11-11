import type { ProcessEndWatch } from "./process-end-watch";
import type { MachineProcessWatch } from "./types";

export function createMachineProcessWatch(
  watch: Pick<ProcessEndWatch, "arm" | "settle" | "suspend">,
  guests: Set<string>,
): MachineProcessWatch {
  return {
    has: (threadId) => guests.has(threadId),
    async begin(threadId) {
      guests.add(threadId);
      await watch.arm(threadId);
    },
    end(threadId, phase) {
      guests.delete(threadId);
      if (phase === "settle") watch.settle(threadId);
      else watch.suspend(threadId);
    },
  };
}
