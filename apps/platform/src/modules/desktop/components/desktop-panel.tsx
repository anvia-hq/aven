import { Hand, Monitor, Power } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { PanelNotice } from "@/components/panel-notice";
import { SidePanel } from "@/components/side-panel";
import { Skeleton } from "@/components/skeleton";
import { Spinner } from "@/components/spinner";

import { useDesktopControl } from "../hooks/use-desktop-control";
import { useDesktopStatus } from "../hooks/use-desktop-status";
import { useDesktopWake } from "../hooks/use-desktop-wake";
import type { DesktopStatus } from "../types";
import { DesktopViewer } from "./desktop-viewer";

type Props = {
  threadId: string;
  onClose: () => void;
};

type View = "loading" | "problem" | "no-sandbox" | "desktop";

function viewOf(status: DesktopStatus | null, problem: string | null): View {
  if (problem) return "problem";
  if (!status) return "loading";
  return status.available ? "desktop" : "no-sandbox";
}

function hintFor(inControl: boolean, heldByOther: boolean) {
  if (inControl) return "You are in control. The agent's inputs are paused.";
  if (heldByOther) return "Someone else is controlling the desktop.";
  return "Watching. Take over to click and type.";
}

// The thread's desktop beside the conversation: watch it live, or take it over so the agent's
// inputs pause while you drive it.
export function DesktopPanel({ threadId, onClose }: Props) {
  const { status, problem, refresh } = useDesktopStatus(threadId);
  const { controlling, busy, takeOver, giveBack } = useDesktopControl(threadId);
  const { waking, wake } = useDesktopWake(threadId, refresh);
  const view = viewOf(status, problem);
  const heldByOther = status?.available === true && status.held && !status.heldByMe;
  const inControl = controlling && view === "desktop";

  return (
    <SidePanel
      title="Desktop"
      icon={Monitor}
      onClose={onClose}
      actions={
        <>
          {view === "desktop" && (
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {hintFor(inControl, heldByOther)}
            </p>
          )}
          {view !== "desktop" && <span className="flex-1" />}
          {view === "desktop" &&
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
          <PanelNotice>
            <span className="flex flex-col items-center gap-4">
              The thread's sandbox is not running. It starts when the agent works on this thread,
              and stops after fifteen idle minutes. You can also wake it up to watch the desktop.
              <Button variant="outline" disabled={waking} onClick={() => void wake()}>
                {waking ? <Spinner /> : <Power />} {waking ? "Waking up" : "Wake up"}
              </Button>
            </span>
          </PanelNotice>
        )}
        {view === "desktop" && (
          <DesktopViewer threadId={threadId} viewOnly={!inControl} onEnded={() => void refresh()} />
        )}
      </div>
    </SidePanel>
  );
}
