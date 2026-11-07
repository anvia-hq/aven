import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";

import { wsUrl } from "@/lib/api";
import type { Computer } from "../types";

type Phase = "connecting" | "connected" | "ended";

export function useDesktopStream({ path }: Computer, viewOnly: boolean, onEnded: () => void) {
  const target = useRef<HTMLDivElement>(null);
  const client = useRef<RFB | null>(null);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [attempt, setAttempt] = useState(0);
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
