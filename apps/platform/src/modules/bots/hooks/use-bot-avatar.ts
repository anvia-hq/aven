import { useEffect, useRef, type RefObject } from "react";

import { drawFallback } from "../avatar-fallback";
import type { AvatarHandle, AvatarLook } from "../types";

export function useBotAvatar(canvas: RefObject<HTMLCanvasElement | null>, look: AvatarLook) {
  const handle = useRef<AvatarHandle | null>(null);
  const mood = useRef(look.mood);
  const follow = useRef(look.follow === true);
  const steady = useRef(look.steady === true);
  const { family, color, accessory = "none", delayMs } = look;

  useEffect(() => {
    const element = canvas.current;

    if (!element) return;

    drawFallback(element, color);

    let cancelled = false;
    void import("../avatar-stage").then(({ mountAvatar }) => {
      if (cancelled) return;

      handle.current = mountAvatar(element, {
        family,
        color,
        accessory,
        delayMs,
        mood: mood.current,
        follow: follow.current,
        steady: steady.current,
      });
    });

    return () => {
      cancelled = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, [canvas, family, color, accessory, delayMs]);

  useEffect(() => {
    mood.current = look.mood;
    handle.current?.setMood(look.mood);
  }, [look.mood]);

  useEffect(() => {
    const nextFollow = look.follow === true;
    const nextSteady = look.steady === true;
    follow.current = nextFollow;
    steady.current = nextSteady;
    handle.current?.setOptions({ follow: nextFollow, steady: nextSteady });
  }, [look.follow, look.steady]);
}
