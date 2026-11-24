import type { Emit } from "@aven/agent-backend/types";

export function createSandboxReporter(enabled: boolean, send: Emit) {
  let preparing = false;
  let ready = false;

  return {
    preparing() {
      if (!enabled || preparing || ready) return;

      preparing = true;
      send({ type: "sandbox_status", phase: "preparing" });
    },
    ready() {
      if (!enabled || !preparing || ready) return;

      ready = true;
      send({ type: "sandbox_status", phase: "ready" });
    },
  };
}
