import { Hand, Monitor } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { Skeleton } from "@/components/skeleton";

import { useDesktopControl } from "../hooks/use-desktop-control";
import { useDesktopStatus } from "../hooks/use-desktop-status";
import type { DesktopStatus } from "../types";
import { DesktopViewer } from "./desktop-viewer";

type Props = {
  threadId: string;
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
export function DesktopPanel({ threadId }: Props) {
  const { status, problem, refresh } = useDesktopStatus(threadId);
  const { controlling, busy, takeOver, giveBack } = useDesktopControl(threadId);
  const view = viewOf(status, problem);
  const heldByOther = status?.available === true && status.held && !status.heldByMe;
  const inControl = controlling && view === "desktop";

  return (
    <section className="flex size-full min-w-0 flex-col" aria-label="Desktop">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <Monitor className="size-4 text-muted-foreground" />
        <h2 className="flex-1 text-sm font-medium">Desktop</h2>
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
      </header>
      {view === "desktop" && (
        <p className="border-b px-4 py-1.5 text-xs text-muted-foreground">
          {hintFor(inControl, heldByOther)}
        </p>
      )}
      <div className="min-h-0 flex-1">
        {view === "loading" && <Skeleton className="size-full rounded-none" />}
        {view === "problem" && <Notice>{problem}</Notice>}
        {view === "no-sandbox" && (
          <Notice>
            The thread's sandbox is not running. It starts when the agent works on this thread, and
            stops after fifteen idle minutes.
          </Notice>
        )}
        {view === "desktop" && (
          <DesktopViewer threadId={threadId} viewOnly={!inControl} onEnded={() => void refresh()} />
        )}
      </div>
    </section>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      <p className="max-w-sm">{children}</p>
    </div>
  );
}
