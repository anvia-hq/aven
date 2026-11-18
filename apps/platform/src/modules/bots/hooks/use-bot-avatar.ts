import { useEffect, useRef, type RefObject } from "react";

import { drawFallback } from "../avatar-fallback";
import type { AvatarHandle, AvatarLook } from "../types";

export function useBotAvatar(canvas: RefObject<HTMLCanvasElement | null>, look: AvatarLook) {
  const handle = useRef<AvatarHandle | null>(null);
  const mood = useRef(look.mood);
  const { family, color, delayMs } = look;

  useEffect(() => {
    const element = canvas.current;

    if (!element) return;

    drawFallback(element, color);

    let cancelled = false;
    void import("../avatar-stage").then(({ mountAvatar }) => {
      if (cancelled) return;

      handle.current = mountAvatar(element, { family, color, delayMs, mood: mood.current });
    });

    return () => {
      cancelled = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, [canvas, family, color, delayMs]);

  useEffect(() => {
    mood.current = look.mood;
    handle.current?.setMood(look.mood);
  }, [look.mood]);
}
