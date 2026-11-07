import { Terminal } from "@mynaui/icons-react";

import { PanelNotice } from "@/components/panel-notice";
import { SidePanel } from "@/components/side-panel";
import { Skeleton } from "@/components/skeleton";
import type { Computer } from "@/modules/desktop/computer";
import { SandboxAsleepNotice } from "@/modules/desktop/components/sandbox-asleep-notice";
import { useDesktopStatus } from "@/modules/desktop/hooks/use-desktop-status";
import { useDesktopWake } from "@/modules/desktop/hooks/use-desktop-wake";
import { sandboxView } from "@/modules/desktop/sandbox-view";

import { TerminalViewer } from "./terminal-viewer";

type Props = {
  computer: Computer;
  onClose: () => void;
};

export function TerminalPanel({ computer, onClose }: Props) {
  const { status, problem, refresh } = useDesktopStatus(computer);
  const { waking, wake } = useDesktopWake(computer, refresh);
  const view = sandboxView(status, problem);

  return (
    <SidePanel title="Terminal" icon={Terminal} onClose={onClose}>
      <div className="min-h-0 flex-1">
        {view === "problem" && <PanelNotice>{problem}</PanelNotice>}
        {view === "loading" && <Skeleton className="size-full rounded-none" />}
        {view === "ready" && <TerminalViewer computer={computer} />}
        {view === "no-sandbox" && (
          <SandboxAsleepNotice
            asleep={computer.asleep}
            purpose="open a terminal"
            waking={waking}
            onWake={() => void wake()}
          />
        )}
      </div>
    </SidePanel>
  );
}
