import { Fragment, type ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/resizable";
import { safeStorage } from "@/hooks/use-local-storage";
import { threadComputer } from "@/modules/desktop/computer";
import { DesktopPanel } from "@/modules/desktop/components/desktop-panel";
import { DiffPanel } from "@/modules/diff/components/diff-panel";
import { FilesPanel } from "@/modules/files/components/files-panel";
import { TerminalPanel } from "@/modules/terminal/components/terminal-panel";

import type { ThreadPanels } from "../hooks/use-thread-panels";

type Props = {
  threadId: string;
  running: boolean;
  panels: ThreadPanels;
  /** The person made the thread: anyone else has no Desktop or Terminal (decision 0084). */
  owned: boolean;
  /** The divider between two panels. */
  handleClassName: string;
};

// The column beside a thread's conversation: Files, Changes, Desktop and Terminal, whichever are
// open, stacked top to bottom, with the sizes they were last given.
export function ThreadSidePanels({ threadId, running, panels, owned, handleClassName }: Props) {
  const { diff, desktop, files, terminal } = panels;
  const side = useDefaultLayout({
    id: "aven.thread-side",
    panelIds: ["files", "diff", "desktop", "terminal"],
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
  if (owned && desktop.open) {
    sidePanels.push({
      id: "desktop",
      node: <DesktopPanel computer={threadComputer(threadId)} onClose={desktop.close} />,
    });
  }

  if (owned && terminal.open) {
    sidePanels.push({
      id: "terminal",
      node: <TerminalPanel computer={threadComputer(threadId)} onClose={terminal.close} />,
    });
  }

  // Each panel is a card on the frame, level with the conversation's; the gap between two is
  // their divider.
  return (
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={side.defaultLayout}
      onLayoutChanged={side.onLayoutChanged}
    >
      {sidePanels.map((panel, index) => (
        <Fragment key={panel.id}>
          {index > 0 && <ResizableHandle className={handleClassName} />}
          <ResizablePanel id={panel.id} defaultSize="50" minSize="15">
            {panel.node}
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}
