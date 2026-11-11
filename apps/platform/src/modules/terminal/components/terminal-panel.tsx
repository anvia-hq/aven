import { Terminal } from "@mynaui/icons-react";

import { PanelNotice } from "@/components/panel-notice";
import { SidePanel } from "@/components/side-panel";
import { Skeleton } from "@/components/skeleton";
import { ComputerAsleepNotice } from "@/modules/computer/components/computer-asleep-notice";
import { computerView } from "@/modules/computer/computer-view";
import { useComputerStatus } from "@/modules/computer/hooks/use-computer-status";
import { useComputerWake } from "@/modules/computer/hooks/use-computer-wake";

import { TerminalViewer } from "./terminal-viewer";
import type { Computer } from "@/modules/computer/types";

type Props = {
  computer: Computer;
  onClose: () => void;
};

export function TerminalPanel({ computer, onClose }: Props) {
  const { status, problem, refresh } = useComputerStatus(computer);
  const { waking, wake } = useComputerWake(computer, refresh);
  const view = computerView(status, problem);

  return (
    <SidePanel title="Terminal" icon={Terminal} onClose={onClose}>
      <div className="min-h-0 flex-1">
        {view === "problem" && <PanelNotice>{problem}</PanelNotice>}
        {view === "loading" && <Skeleton className="size-full rounded-none" />}
        {view === "ready" && <TerminalViewer computer={computer} />}
        {view === "no-computer" && (
          <ComputerAsleepNotice
            computer={computer}
            purpose="open a terminal"
            waking={waking}
            onWake={() => void wake()}
          />
        )}
      </div>
    </SidePanel>
  );
}
