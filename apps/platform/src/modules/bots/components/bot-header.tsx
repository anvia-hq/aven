import { useBotsWorking } from "../hooks/use-bots-working";
import type { Bot } from "../types";
import { BotAvatar } from "./bot-avatar";
import { BotSettingsDialog } from "./bot-settings-dialog";

const TRIGGER =
  "group/bot-badge pointer-events-auto flex h-auto max-w-full flex-col items-center gap-1.5 bg-transparent p-0 hover:bg-transparent dark:hover:bg-transparent";

const BADGE =
  "max-w-full truncate rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background shadow-xs transition-colors group-hover/bot-badge:bg-foreground/90";

function BotPill({ bot }: { bot: Bot }) {
  const working = useBotsWorking();
  const online = working.has(bot.id);

  return (
    <>
      <BotAvatar
        bot={bot}
        mood={online ? "working" : "idle"}
        className="size-12 shrink-0 transition-transform group-hover/bot-badge:scale-105"
        follow
      />
      <span className={BADGE}>{bot.name}</span>
    </>
  );
}

export function BotHeader({ bot }: { bot: Bot }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center bg-[linear-gradient(to_bottom,var(--background)_0%,color-mix(in_oklch,var(--background)_82%,transparent)_38%,color-mix(in_oklch,var(--background)_38%,transparent)_72%,transparent_100%)] px-3 pt-3 pb-7">
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
