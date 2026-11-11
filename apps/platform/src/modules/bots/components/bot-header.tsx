import type { Bot } from "../types";
import { BotSettingsDialog } from "./bot-settings-dialog";

export function BotHeader({ bot }: { bot: Bot }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3 md:h-10 md:px-4">
      <h1 className="min-w-0 truncate text-sm font-medium">{bot.name}</h1>
      <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground @lg:block">
        {bot.description}
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!bot.isMain && <BotSettingsDialog bot={bot} />}
      </div>
    </header>
  );
}
