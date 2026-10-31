import { useState } from "react";

import { api, attempt } from "@/lib/api";

import type { Computer } from "../computer";

// Starting a computer when it is off, so its desktop can be watched without a message to the agent
// (decision 0039). It takes a while: the container boots a whole desktop.
export function useDesktopWake({ path }: Computer, onAwake: () => void) {
  const [waking, setWaking] = useState(false);

  async function wake() {
    setWaking(true);
    await attempt("Could not wake the sandbox", async () => {
      await api(`${path}/desktop/wake`, { method: "POST" });
      onAwake();
    });
    setWaking(false);
  }

  return { waking, wake };
}
