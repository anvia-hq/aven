import { Avatar, AvatarFallback } from "@/components/avatar";

import type { Bot } from "../types";

// The bot's emoji, or the first letter of its name until it has one.
export function BotAvatar({
  bot,
  size,
}: {
  bot: Pick<Bot, "name" | "avatar">;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar size={size}>
      <AvatarFallback className="text-sm">
        {bot.avatar || bot.name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
