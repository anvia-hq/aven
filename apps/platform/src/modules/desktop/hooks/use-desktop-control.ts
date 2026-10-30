import { useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt, errorMessage } from "@/lib/api";

// The control plane gives control for a minute at a time; this renews it well before that.
const RENEW_MS = 20_000;

// Taking over a thread's desktop: the agent's inputs fail while a person holds it. Control is kept
// by renewing while this is mounted and given back on leaving, and a closed tab's lease runs out.
export function useDesktopControl(threadId: string) {
  const [controlling, setControlling] = useState(false);
  const [busy, setBusy] = useState(false);
  const takeoverPath = `/threads/${threadId}/desktop/takeover`;
  const releasePath = `/threads/${threadId}/desktop/release`;

  async function takeOver() {
    setBusy(true);
    await attempt("Could not take over the desktop", async () => {
      await api(takeoverPath, { method: "POST" });
      setControlling(true);
    });
    setBusy(false);
  }

  async function giveBack() {
    setControlling(false);
    await attempt("Could not give the desktop back", () => api(releasePath, { method: "POST" }));
  }

  useEffect(() => {
    if (!controlling) return;
    const renew = setInterval(() => {
      api(takeoverPath, { method: "POST" }).catch((failure: unknown) => {
        setControlling(false);
        toast.add({
          title: "You no longer control the desktop",
          description: errorMessage(failure),
          type: "error",
        });
      });
    }, RENEW_MS);
    // `keepalive` lets the request outlive a closing page.
    const release = () =>
      void fetch(`/api${releasePath}`, { method: "POST", credentials: "include", keepalive: true });
    window.addEventListener("pagehide", release);
    return () => {
      clearInterval(renew);
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [controlling, takeoverPath, releasePath]);

  return { controlling, busy, takeOver, giveBack };
}
