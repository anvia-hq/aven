import type { MachineProvider } from "@aven/agents/types";
import type { RunThreadInfo } from "@aven/protocol/types";

export function sandboxProvider(thread: RunThreadInfo): MachineProvider | undefined {
  return thread.provider === "boat" || thread.provider === "spaces" ? thread.provider : undefined;
}
