import { useRef, type ReactNode } from "react";

import { Avatar, AvatarFallback } from "@aven/ui/avatar";

import { avatarFor, parseAvatarSetting } from "../avatar";
import { useBotAvatar } from "../hooks/use-bot-avatar";
import type { Bot, BotMood } from "../types";

export function BotAvatar({
  bot,
  mood = "idle",
  className,
  children,
  delayMs,
  follow = false,
  steady = false,
}: {
  bot: Pick<Bot, "id" | "avatar">;
  mood?: BotMood;
  className?: string;
  children?: ReactNode;
  delayMs?: number;
  follow?: boolean;
  steady?: boolean;
}) {
  const setting = parseAvatarSetting(bot.avatar);
  const text = setting === null && bot.avatar !== "" && !bot.avatar.startsWith("{");
  const look = avatarFor(bot.id, setting ?? undefined);
  const canvas = useRef<HTMLCanvasElement>(null);
  useBotAvatar(canvas, {
    family: look.family,
    color: look.color,
    mood,
    delayMs: delayMs ?? look.delay,
    follow,
    steady,
  });

  return (
    <Avatar className={className}>
      {text ? (
        <AvatarFallback className="bg-primary text-[length:inherit] text-primary-foreground">
          {bot.avatar}
        </AvatarFallback>
      ) : (
        <canvas
          ref={canvas}
          aria-hidden="true"
          data-family={look.family}
          data-color={look.color}
          data-mood={mood}
          className="size-full!"
        />
      )}
      {children}
    </Avatar>
  );
}
