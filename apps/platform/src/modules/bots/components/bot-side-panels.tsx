import { Fragment, type ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/resizable";
import { safeStorage } from "@/hooks/use-local-storage";
import { botComputer } from "@/modules/desktop/computer";
import { DesktopPanel } from "@/modules/desktop/components/desktop-panel";
import { TerminalPanel } from "@/modules/terminal/components/terminal-panel";

import type { BotPanels } from "../hooks/use-bot-panels";

type Props = {
  botId: string;
  panels: BotPanels;
  /** The divider between two panels. */
  handleClassName: string;
};

// The column beside the bot's chat: its Desktop and Terminal, whichever are open, stacked top to
// bottom, with the sizes they were last given.
export function BotSidePanels({ botId, panels, handleClassName }: Props) {
  const { desktop, terminal } = panels;
  const side = useDefaultLayout({
    id: "aven.bot-side",
    panelIds: ["desktop", "terminal"],
    storage: safeStorage,
  });
  const computer = botComputer(botId);

  const open: { id: string; node: ReactNode }[] = [];
  if (desktop.open) {
    open.push({
      id: "desktop",
      node: <DesktopPanel computer={computer} onClose={desktop.close} />,
    });
  }
  if (terminal.open) {
    open.push({
      id: "terminal",
      node: <TerminalPanel computer={computer} onClose={terminal.close} />,
    });
  }

  // Each panel is a card on the frame, level with the chat's; the gap between two is their divider.
  return (
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={side.defaultLayout}
      onLayoutChanged={side.onLayoutChanged}
    >
      {open.map((panel, index) => (
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
