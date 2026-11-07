import { useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt, errorMessage } from "@/lib/api";

import type { Computer } from "../computer";

const RENEW_MS = 20_000;

export function useDesktopControl({ path }: Computer) {
  const [controlling, setControlling] = useState(false);
  const [busy, setBusy] = useState(false);
  const takeoverPath = `${path}/desktop/takeover`;
  const releasePath = `${path}/desktop/release`;

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
