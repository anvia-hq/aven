import { Terminal } from "@mynaui/icons-react";

import { PanelNotice } from "@/components/panel-notice";
import { SidePanel } from "@/components/side-panel";
import { Skeleton } from "@/components/skeleton";
import { SandboxAsleepNotice } from "@/modules/desktop/components/sandbox-asleep-notice";
import { useDesktopStatus } from "@/modules/desktop/hooks/use-desktop-status";
import { useDesktopWake } from "@/modules/desktop/hooks/use-desktop-wake";
import { sandboxView } from "@/modules/desktop/sandbox-view";

import { TerminalViewer } from "./terminal-viewer";

type Props = {
  threadId: string;
  onClose: () => void;
};

// A shell in the thread's sandbox beside the conversation. Whether the sandbox runs, and waking
// it, are the desktop's: it is the same container.
export function TerminalPanel({ threadId, onClose }: Props) {
  const { status, problem, refresh } = useDesktopStatus(threadId);
  const { waking, wake } = useDesktopWake(threadId, refresh);
  const view = sandboxView(status, problem);

  return (
    <SidePanel title="Terminal" icon={Terminal} onClose={onClose}>
      <div className="min-h-0 flex-1">
        {view === "problem" && <PanelNotice>{problem}</PanelNotice>}
        {view === "loading" && <Skeleton className="size-full rounded-none" />}
        {view === "ready" && <TerminalViewer threadId={threadId} />}
        {view === "no-sandbox" && (
          <SandboxAsleepNotice
            purpose="open a terminal"
            waking={waking}
            onWake={() => void wake()}
          />
        )}
      </div>
    </SidePanel>
  );
}
