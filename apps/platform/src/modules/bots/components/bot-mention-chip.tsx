import { cn } from "cn";

import { bubbleInk, bubbleStyle } from "../bubble-tint";
import { BotAvatar } from "./bot-avatar";

export function BotMentionChip({
  bot,
  color,
}: {
  bot: { id: string; name: string; avatar: string };
  color?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-fit items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5 align-middle leading-none font-medium text-[0.9em]",
        color ? bubbleInk(color) : "bg-muted text-foreground",
      )}
      style={bubbleStyle(color)}
      title={`@${bot.name}`}
      data-mention="bot"
    >
      <BotAvatar bot={bot} className="size-4" />
      {bot.name}
    </span>
  );
}
