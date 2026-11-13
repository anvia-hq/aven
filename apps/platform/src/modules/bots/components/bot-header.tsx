import { useBotsWorking } from "../hooks/use-bots-working";
import type { Bot } from "../types";
import { BotAvatar } from "./bot-avatar";
import { BotSettingsDialog } from "./bot-settings-dialog";

export function BotHeader({ bot }: { bot: Bot }) {
  const working = useBotsWorking();
  const online = working.has(bot.id);

  return (
    <div className="pointer-events-none z-10 flex justify-center px-3 pt-2.5 md:absolute md:inset-x-0 md:top-2.5 md:pt-0">
      <header
        aria-label={`${bot.name} header`}
        title={bot.description || undefined}
        className="bg-background/95 pointer-events-auto flex max-w-full items-center gap-3 rounded-full border px-5 py-2.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <BotAvatar
          bot={bot}
          mood={online ? "working" : "idle"}
          className="size-9 shrink-0 text-base"
        />
        <h1 className="truncate text-base font-semibold">{bot.name}</h1>
        {bot.description && (
          <p className="hidden max-w-48 truncate text-xs text-muted-foreground sm:block">
            {bot.description}
          </p>
        )}
        {!bot.isMain && <BotSettingsDialog bot={bot} />}
      </header>
    </div>
  );
}
