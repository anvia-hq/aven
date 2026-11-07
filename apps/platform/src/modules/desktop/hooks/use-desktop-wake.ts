import { useState } from "react";

import { api, attempt } from "@/lib/api";

import type { Computer } from "../computer";

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
