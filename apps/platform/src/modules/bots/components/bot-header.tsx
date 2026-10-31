import { Monitor } from "@mynaui/icons-react";

import { PanelToggle } from "@/components/panel-toggle";

import type { BotPanels } from "../hooks/use-bot-panels";
import type { Bot } from "../types";
import { BotSettingsDialog } from "./bot-settings-dialog";

// The bar over the bot's chat: its name and what it is for, its settings when the sidebar has no tile
// for it, and the button that opens its computer's desktop beside the chat.
export function BotHeader({ bot, panels }: { bot: Bot; panels: BotPanels }) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
      <h1 className="min-w-0 truncate text-sm font-medium">{bot.name}</h1>
      <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground @lg:block">
        {bot.description}
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!bot.isMain && <BotSettingsDialog bot={bot} />}
        <PanelToggle
          label="Desktop"
          icon={Monitor}
          open={panels.desktop.open}
          onToggle={panels.desktop.toggle}
        />
      </div>
    </header>
  );
}
