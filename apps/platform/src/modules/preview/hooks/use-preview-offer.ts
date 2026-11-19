import { useAtom, useSetAtom } from "jotai";
import { useEffect, useEffectEvent } from "react";

import { previewOfferAtom } from "../atoms/preview-offer-atom";

export function useOfferPreview() {
  const set = useSetAtom(previewOfferAtom);

  return (threadId: string, port: number) =>
    set((before) => ({ threadId, port, nonce: (before?.nonce ?? 0) + 1 }));
}

export function usePreviewOffer(threadId: string, show: () => void) {
  const [offer, set] = useAtom(previewOfferAtom);
  const mine = offer?.threadId === threadId ? offer : null;
  const reveal = useEffectEvent(show);

  useEffect(() => {
    if (mine) reveal();
  }, [mine?.nonce]);

  return { offer: mine, clear: () => set(null) };
}
