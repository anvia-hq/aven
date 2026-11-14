import { useBotsWorking } from "../hooks/use-bots-working";
import type { Bot } from "../types";
import { BotAvatar } from "./bot-avatar";
import { BotSettingsDialog } from "./bot-settings-dialog";

const PILL =
  "pointer-events-auto flex h-auto max-w-full items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 shadow-sm backdrop-blur-md";

function BotPill({ bot }: { bot: Bot }) {
  const working = useBotsWorking();
  const online = working.has(bot.id);

  return (
    <>
      <BotAvatar bot={bot} mood={online ? "working" : "idle"} className="size-7 shrink-0 text-sm" />
      <span className="truncate text-sm font-semibold">{bot.name}</span>
    </>
  );
}

export function BotHeader({ bot }: { bot: Bot }) {
  return (
    <div className="pointer-events-none z-10 flex justify-center px-3 pt-2.5 md:absolute md:inset-x-0 md:top-2.5 md:pt-0">
      <header
        aria-label={`${bot.name} header`}
        title={bot.description || undefined}
        className="flex max-w-full"
      >
        <h1 className="sr-only">{bot.name}</h1>
        <BotSettingsDialog bot={bot} className={`${PILL} hover:bg-card/90 dark:hover:bg-card/90`}>
          <BotPill bot={bot} />
        </BotSettingsDialog>
      </header>
    </div>
  );
}
