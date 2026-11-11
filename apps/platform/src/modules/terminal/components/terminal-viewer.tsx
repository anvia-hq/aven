import "@xterm/xterm/css/xterm.css";

import { Refresh } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { Spinner } from "@/components/spinner";

import { useTerminal } from "../hooks/use-terminal";
import type { Computer } from "@/modules/computer/types";

type Props = {
  computer: Computer;
};

export function TerminalViewer({ computer }: Props) {
  const { target, phase, reason, reconnect } = useTerminal(computer);

  return (
    <div className="relative size-full bg-background">
      <div ref={target} className="size-full p-2" />
      {phase !== "connected" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 text-sm text-muted-foreground">
          {phase === "connecting" ? (
            <>
              <Spinner className="size-5" />
              Opening the terminal…
            </>
          ) : (
            <>
              {reason}
              <Button variant="outline" size="sm" onClick={reconnect}>
                <Refresh /> New shell
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
