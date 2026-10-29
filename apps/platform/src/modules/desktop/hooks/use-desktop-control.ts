import { useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api";

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
    try {
      await api(takeoverPath, { method: "POST" });
      setControlling(true);
    } catch (failure) {
      toast.add({
        title: "Could not take over the desktop",
        description: errorMessage(failure),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function giveBack() {
    setControlling(false);
    await api(releasePath, { method: "POST" }).catch((failure: unknown) =>
      toast.add({
        title: "Could not give the desktop back",
        description: errorMessage(failure),
        type: "error",
      }),
    );
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
