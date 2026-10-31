import { Power, Terminal } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { PanelNotice } from "@/components/panel-notice";
import { SidePanel } from "@/components/side-panel";
import { Skeleton } from "@/components/skeleton";
import { Spinner } from "@/components/spinner";
import { useDesktopStatus } from "@/modules/desktop/hooks/use-desktop-status";
import { useDesktopWake } from "@/modules/desktop/hooks/use-desktop-wake";
import type { DesktopStatus } from "@/modules/desktop/types";

import { TerminalViewer } from "./terminal-viewer";

type Props = {
  threadId: string;
  onClose: () => void;
};

type View = "loading" | "problem" | "no-sandbox" | "terminal";

function viewOf(status: DesktopStatus | null, problem: string | null): View {
  if (problem) return "problem";
  if (!status) return "loading";
  return status.available ? "terminal" : "no-sandbox";
}

// A shell in the thread's sandbox beside the conversation. Whether the sandbox runs, and waking
// it, are the desktop's: it is the same container.
export function TerminalPanel({ threadId, onClose }: Props) {
  const { status, problem, refresh } = useDesktopStatus(threadId);
  const { waking, wake } = useDesktopWake(threadId, refresh);
  const view = viewOf(status, problem);

  return (
    <SidePanel title="Terminal" icon={Terminal} onClose={onClose}>
      <div className="min-h-0 flex-1">
        {view === "problem" && <PanelNotice>{problem}</PanelNotice>}
        {view === "loading" && <Skeleton className="size-full rounded-none" />}
        {view === "terminal" && <TerminalViewer threadId={threadId} />}
        {view === "no-sandbox" && (
          <PanelNotice>
            <span className="flex flex-col items-center gap-4">
              The thread's sandbox is not running. It starts when the agent works on this thread,
              and stops after fifteen idle minutes. You can also wake it up to open a terminal.
              <Button variant="outline" disabled={waking} onClick={() => void wake()}>
                {waking ? <Spinner /> : <Power />} {waking ? "Waking up" : "Wake up"}
              </Button>
            </span>
          </PanelNotice>
        )}
      </div>
    </SidePanel>
  );
}
