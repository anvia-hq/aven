import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";

import { wsUrl } from "@/lib/api";

import type { Computer } from "../computer";

type Phase = "connecting" | "connected" | "ended";

// A computer's desktop, drawn by noVNC into `target`. The desktop is scaled to fit and never
// resized, because the agent's screenshots and clicks are in the desktop's own coordinates. A
// connection that ends stays ended until `reconnect`.
export function useDesktopStream({ path }: Computer, viewOnly: boolean, onEnded: () => void) {
  const target = useRef<HTMLDivElement>(null);
  const client = useRef<RFB | null>(null);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [attempt, setAttempt] = useState(0);
  // The latest callback, so a caller that makes a new one each render does not reconnect.
  const ended = useRef(onEnded);
  useEffect(() => {
    ended.current = onEnded;
  });

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    setPhase("connecting");
    const rfb = new RFB(element, wsUrl(`${path}/desktop/stream`), {
      wsProtocols: ["binary"],
    });
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.background = "transparent";
    rfb.viewOnly = true;
    // noVNC logs an error when `disconnect` is called on a client that has already ended, which a
    // dropped connection followed by Reconnect or by closing the panel would do.
    let over = false;
    rfb.addEventListener("connect", () => setPhase("connected"));
    rfb.addEventListener("disconnect", () => {
      over = true;
      setPhase("ended");
      ended.current();
    });
    client.current = rfb;
    return () => {
      if (!over) rfb.disconnect();
      client.current = null;
    };
  }, [path, attempt]);

  useEffect(() => {
    if (client.current) client.current.viewOnly = viewOnly;
    if (!viewOnly) client.current?.focus();
  }, [viewOnly, phase]);

  return { target, phase, reconnect: () => setAttempt((count) => count + 1) };
}
