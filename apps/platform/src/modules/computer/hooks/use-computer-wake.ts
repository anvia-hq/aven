import { useState } from "react";

import { api, attempt } from "@/lib/api";
import type { Computer } from "../types";

export function useComputerWake({ path }: Computer, onAwake: () => void) {
  const [waking, setWaking] = useState(false);

  async function wake() {
    setWaking(true);
    await attempt("Could not start the computer", async () => {
      await api(`${path}/computer/wake`, { method: "POST" });
      onAwake();
    });
    setWaking(false);
  }

  return { waking, wake };
}
