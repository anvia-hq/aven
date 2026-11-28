import { useCallback, useEffect, useState } from "react";

import { copyToClipboard } from "@aven/ui/clipboard";
import { toast } from "@aven/ui/toast";
import { api, attempt } from "@/lib/api";

import { pairingUrlOf, remainingSecondsOf } from "../pairing";
import type { MobilePairingCode } from "../types";

export function useMobilePairing() {
  const [pairing, setPairing] = useState<MobilePairingCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);

  const pairingUrl = pairing ? pairingUrlOf(window.location.origin, pairing.code) : null;
  const expired = pairing !== null && secondsLeft === 0;

  useEffect(() => {
    if (!pairing) return;

    const sync = () => setSecondsLeft(remainingSecondsOf(pairing.expiresAt));
    sync();
    const timer = window.setInterval(sync, 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  const generate = useCallback(async () => {
    setLoading(true);
    setCopied(false);

    try {
      const created = await attempt("Could not create a pairing code", () =>
        api<MobilePairingCode>("/mobile-pair", { method: "POST" }),
      );

      if (created) {
        setPairing(created);
        setSecondsLeft(remainingSecondsOf(created.expiresAt));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setPairing(null);
    setSecondsLeft(0);
    setCopied(false);
  }, []);

  const copyLink = useCallback(async () => {
    if (!pairingUrl) return;

    const ok = await copyToClipboard(pairingUrl);

    if (!ok) {
      toast.add({ title: "Could not copy the pairing link", type: "error" });
      return;
    }

    setCopied(true);
    toast.add({ title: "Pairing link copied", type: "success" });
  }, [pairingUrl]);

  return {
    pairing,
    pairingUrl,
    loading,
    secondsLeft,
    expired,
    copied,
    generate,
    clear,
    copyLink,
  };
}
