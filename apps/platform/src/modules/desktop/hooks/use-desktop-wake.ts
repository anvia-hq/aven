import { useState } from "react";

import { api, attempt } from "@/lib/api";

// Starting a thread's sandbox when it is off, so its desktop can be watched without a message to
// the agent (decision 0039). It takes a while: the container boots a whole desktop.
export function useDesktopWake(threadId: string, onAwake: () => void) {
  const [waking, setWaking] = useState(false);

  async function wake() {
    setWaking(true);
    await attempt("Could not wake the sandbox", async () => {
      await api(`/threads/${threadId}/desktop/wake`, { method: "POST" });
      onAwake();
    });
    setWaking(false);
  }

  return { waking, wake };
}
