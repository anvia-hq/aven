import { Monitor, Terminal } from "@mynaui/icons-react";

import { PanelToggle } from "@/components/panel-toggle";

import type { BotPanels } from "../hooks/use-bot-panels";
import type { Bot } from "../types";

// The bar over the bot's chat: its name, and the buttons that open its computer beside the chat.
export function BotHeader({ bot, panels }: { bot: Bot; panels: BotPanels }) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{bot.name}</h1>
      <PanelToggle
        label="Desktop"
        icon={Monitor}
        open={panels.desktop.open}
        onToggle={panels.desktop.toggle}
      />
      <PanelToggle
        label="Terminal"
        icon={Terminal}
        open={panels.terminal.open}
        onToggle={panels.terminal.toggle}
      />
    </header>
  );
}
