import { Fragment, type ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import { PANEL_EXIT_MS, PanelEnter } from "@/components/panel-enter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@aven/ui/resizable";
import { useHeldList } from "@/hooks/use-held";
import { safeStorage } from "@/hooks/use-local-storage";
import { threadComputer } from "@/modules/computer/computer";
import { DiffPanel } from "@/modules/diff/components/diff-panel";
import { FilesPanel } from "@/modules/files/components/files-panel";
import { PreviewPanel } from "@/modules/preview/components/preview-panel";
import { TerminalPanel } from "@/modules/terminal/components/terminal-panel";
import type { ThreadPanels } from "../types";

type Props = {
  threadId: string;
  runtimeId: string;
  running: boolean;
  panels: ThreadPanels;
  owned: boolean;
  handleClassName: string;
};

export function ThreadSidePanels({
  threadId,
  runtimeId,
  running,
  panels,
  owned,
  handleClassName,
}: Props) {
  const { diff, files, terminal, preview } = panels;
  const side = useDefaultLayout({
    id: `aven.thread.${threadId}.side`,
    panelIds: ["files", "diff", "terminal", "preview"],
    storage: safeStorage,
  });

  const sidePanels: { id: string; node: ReactNode }[] = [];

  if (files.open) {
    sidePanels.push({
      id: "files",
      node: (
        <FilesPanel key={threadId} threadId={threadId} running={running} onClose={files.close} />
      ),
    });
  }

  if (diff.open) {
    sidePanels.push({
      id: "diff",
      node: <DiffPanel threadId={threadId} running={running} onClose={diff.close} />,
    });
  }

  if (owned && terminal.open) {
    sidePanels.push({
      id: "terminal",
      node: <TerminalPanel computer={threadComputer(threadId)} onClose={terminal.close} />,
    });
  }

  if (owned && preview.open) {
    sidePanels.push({
      id: "preview",
      node: <PreviewPanel key={threadId} runtimeId={runtimeId} onClose={preview.close} />,
    });
  }

  const shown = useHeldList(sidePanels, PANEL_EXIT_MS);

  return (
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={side.defaultLayout}
      onLayoutChanged={side.onLayoutChanged}
    >
      {shown.map(({ item: panel, leaving }, index) => (
        <Fragment key={panel.id}>
          {index > 0 && <ResizableHandle className={handleClassName} />}
          <ResizablePanel id={panel.id} defaultSize="50" minSize="15">
            <PanelEnter leaving={leaving}>{panel.node}</PanelEnter>
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}
