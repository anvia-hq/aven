import { Refresh } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { Spinner } from "@/components/spinner";

import { useDesktopStream } from "../hooks/use-desktop-stream";
import type { Computer } from "../types";

type Props = {
  computer: Computer;
  viewOnly: boolean;
  onEnded: () => void;
};

export function DesktopViewer({ computer, viewOnly, onEnded }: Props) {
  const { target, phase, reconnect } = useDesktopStream(computer, viewOnly, onEnded);

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
              <Button variant="outline" size="sm" onClick={reconnect}>
                <Refresh /> Reconnect
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
