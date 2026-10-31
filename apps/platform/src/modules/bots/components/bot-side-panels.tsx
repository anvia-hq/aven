import { botComputer } from "@/modules/desktop/computer";
import { DesktopPanel } from "@/modules/desktop/components/desktop-panel";

import type { BotPanels } from "../hooks/use-bot-panels";

// The card beside the bot's chat: its computer's desktop.
export function BotSidePanels({ botId, panels }: { botId: string; panels: BotPanels }) {
  return <DesktopPanel computer={botComputer(botId)} onClose={panels.desktop.close} />;
}
