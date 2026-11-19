import type { CSSProperties } from "react";

import { BotAvatar } from "./bot-avatar";

export function BotMentionChip({
  bot,
  tint,
}: {
  bot: { id: string; name: string; avatar: string };
  tint?: CSSProperties;
}) {
  return (
    <span
      className="inline-flex h-fit items-center gap-1 rounded-full bg-muted py-0.5 pr-2 pl-0.5 align-middle leading-none font-medium text-[0.9em] text-foreground"
      style={tint}
      title={`@${bot.name}`}
      data-mention="bot"
    >
      <BotAvatar bot={bot} className="size-4" />
      {bot.name}
    </span>
  );
}
