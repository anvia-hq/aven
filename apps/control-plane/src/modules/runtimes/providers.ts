import { RuntimeOfflineError, type RuntimeHub } from "./hub";
import type { RuntimeProvider } from "./types";

export const manualProvider = (hub: Pick<RuntimeHub, "get">): RuntimeProvider => ({
  kind: "manual",
  async reach(runtimeId, offline) {
    const found = hub.get(runtimeId);
    if (!found) throw new RuntimeOfflineError(offline);
    return found;
  },
});
