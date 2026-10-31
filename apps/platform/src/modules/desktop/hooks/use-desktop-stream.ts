import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";

import { wsUrl } from "@/lib/api";

type Phase = "connecting" | "connected" | "ended";

// A thread's desktop, drawn by noVNC into `target`. The desktop is scaled to fit and never resized,
// because the agent's screenshots and clicks are in the desktop's own coordinates. A connection
// that ends stays ended until `reconnect`.
export function useDesktopStream(threadId: string, viewOnly: boolean, onEnded: () => void) {
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
    const rfb = new RFB(element, wsUrl(`/threads/${threadId}/desktop/stream`), {
      wsProtocols: ["binary"],
    });
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.background = "transparent";
    rfb.viewOnly = true;
    rfb.addEventListener("connect", () => setPhase("connected"));
    rfb.addEventListener("disconnect", () => {
      setPhase("ended");
      ended.current();
    });
    client.current = rfb;
    return () => {
      rfb.disconnect();
      client.current = null;
    };
  }, [threadId, attempt]);

  useEffect(() => {
    if (client.current) client.current.viewOnly = viewOnly;
    if (!viewOnly) client.current?.focus();
  }, [viewOnly, phase]);

  return { target, phase, reconnect: () => setAttempt((count) => count + 1) };
}
