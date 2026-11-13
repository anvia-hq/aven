import { useBotsWorking } from "../hooks/use-bots-working";
import type { Bot } from "../types";
import { BotAvatar } from "./bot-avatar";
import { BotSettingsDialog } from "./bot-settings-dialog";

const PILL =
  "pointer-events-auto flex h-auto max-w-full items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3 py-1.5 shadow-sm backdrop-blur-md";

function BotPill({ bot }: { bot: Bot }) {
  const working = useBotsWorking();
  const online = working.has(bot.id);

  return (
    <>
      <BotAvatar bot={bot} mood={online ? "working" : "idle"} className="size-7 shrink-0 text-sm" />
      <h1 className="truncate text-sm font-semibold">{bot.name}</h1>
      {bot.description && (
        <p className="hidden max-w-48 truncate text-xs font-normal text-muted-foreground sm:block">
          {bot.description}
        </p>
      )}
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
        {bot.isMain ? (
          <div className={PILL}>
            <BotPill bot={bot} />
          </div>
        ) : (
          <BotSettingsDialog bot={bot} className={`${PILL} hover:bg-background/60`}>
            <BotPill bot={bot} />
          </BotSettingsDialog>
        )}
      </header>
    </div>
  );
}
