import RFB from "@novnc/novnc";
import { Refresh } from "@mynaui/icons-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/button";
import { Spinner } from "@/components/spinner";
import { wsUrl } from "@/lib/api";

type Props = {
  threadId: string;
  /** Watch only: nothing the person does reaches the desktop. */
  viewOnly: boolean;
  /** The connection ended, so the caller can look again at why. */
  onEnded: () => void;
};

type Phase = "connecting" | "connected" | "ended";

// A thread's desktop, drawn by noVNC. The desktop is scaled to fit and never resized, because the
// agent's screenshots and clicks are in the desktop's own coordinates.
export function DesktopViewer({ threadId, viewOnly, onEnded }: Props) {
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

  return (
    <div className="relative size-full bg-muted">
      <div ref={target} className="size-full" />
      {phase !== "connected" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/80 text-sm text-muted-foreground">
          {phase === "connecting" ? (
            <>
              <Spinner className="size-5" />
              Connecting to the desktop…
            </>
          ) : (
            <>
              The desktop connection ended.
              <Button variant="outline" size="sm" onClick={() => setAttempt((count) => count + 1)}>
                <Refresh /> Reconnect
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
