import { botComputer } from "@/modules/desktop/computer";
import { DesktopPanel } from "@/modules/desktop/components/desktop-panel";
import type { BotPanels } from "../types";

export function BotSidePanels({ botId, panels }: { botId: string; panels: BotPanels }) {
  return <DesktopPanel computer={botComputer(botId)} onClose={panels.desktop.close} />;
}
