import { Hand, Monitor } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { PanelNotice } from "@/components/panel-notice";
import { SidePanel } from "@/components/side-panel";
import { Skeleton } from "@/components/skeleton";

import type { Computer } from "../computer";
import { useDesktopControl } from "../hooks/use-desktop-control";
import { useDesktopStatus } from "../hooks/use-desktop-status";
import { useDesktopWake } from "../hooks/use-desktop-wake";
import { sandboxView } from "../sandbox-view";
import { DesktopViewer } from "./desktop-viewer";
import { SandboxAsleepNotice } from "./sandbox-asleep-notice";

type Props = {
  computer: Computer;
  onClose: () => void;
};

function hintFor(inControl: boolean, heldByOther: boolean) {
  if (inControl) return "You are in control. The agent's inputs are paused.";
  if (heldByOther) return "Someone else is controlling the desktop.";
  return "Watching. Take over to click and type.";
}

export function DesktopPanel({ computer, onClose }: Props) {
  const { status, problem, refresh } = useDesktopStatus(computer);
  const { controlling, busy, takeOver, giveBack } = useDesktopControl(computer);
  const { waking, wake } = useDesktopWake(computer, refresh);
  const view = sandboxView(status, problem);
  const heldByOther = status?.available === true && status.held && !status.heldByMe;
  const inControl = controlling && view === "ready";

  return (
    <SidePanel
      title="Desktop"
      icon={Monitor}
      onClose={onClose}
      actions={
        <>
          {view === "ready" && (
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {hintFor(inControl, heldByOther)}
            </p>
          )}
          {view !== "ready" && <span className="flex-1" />}
          {view === "ready" &&
            (inControl ? (
              <Button variant="outline" size="sm" onClick={() => void giveBack()}>
                Give back
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy || heldByOther}
                onClick={() => void takeOver()}
              >
                <Hand /> Take over
              </Button>
            ))}
        </>
      }
    >
      <div className="min-h-0 flex-1">
        {view === "loading" && <Skeleton className="size-full rounded-none" />}
        {view === "problem" && <PanelNotice>{problem}</PanelNotice>}
        {view === "no-sandbox" && (
          <SandboxAsleepNotice
            asleep={computer.asleep}
            purpose="watch the desktop"
            waking={waking}
            onWake={() => void wake()}
          />
        )}
        {view === "ready" && (
          <DesktopViewer computer={computer} viewOnly={!inControl} onEnded={() => void refresh()} />
        )}
      </div>
    </SidePanel>
  );
}
