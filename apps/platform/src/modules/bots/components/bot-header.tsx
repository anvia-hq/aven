import { useBotsWorking } from "../hooks/use-bots-working";
import type { Bot } from "../types";
import { BotAvatar } from "./bot-avatar";
import { BotSettingsDialog } from "./bot-settings-dialog";

const TRIGGER =
  "group/bot-badge pointer-events-auto flex h-auto max-w-full flex-col items-center gap-1.5 bg-transparent p-0 hover:bg-transparent dark:hover:bg-transparent";

const BADGE =
  "max-w-full truncate rounded-full border border-border/60 bg-accent/90 px-3 py-1 text-xs font-semibold shadow-md backdrop-blur-md transition-colors group-hover/bot-badge:bg-card/90 dark:group-hover/bot-badge:bg-card/90";

function BotPill({ bot }: { bot: Bot }) {
  const working = useBotsWorking();
  const online = working.has(bot.id);

  return (
    <>
      <BotAvatar
        bot={bot}
        mood={online ? "working" : "idle"}
        className="size-12 shrink-0 drop-shadow-md transition-transform group-hover/bot-badge:scale-105"
        follow
      />
      <span className={BADGE}>{bot.name}</span>
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
        <BotSettingsDialog bot={bot} className={TRIGGER}>
          <BotPill bot={bot} />
        </BotSettingsDialog>
      </header>
    </div>
  );
}
