import type { ReactNode } from "react";

import { cn } from "cn";

import { Avatar, AvatarFallback } from "@/components/avatar";

import type { Bot } from "../types";

// The bot's emoji, or the first letter of its name until it has one. `children` can add to the
// avatar, such as a badge.
export function BotAvatar({
  bot,
  size,
  className,
  solid = false,
  children,
}: {
  bot: Pick<Bot, "name" | "avatar">;
  size?: "default" | "sm" | "lg";
  className?: string;
  /** Drawn in the primary colours, to stand out on a surface the avatar's own would blend into. */
  solid?: boolean;
  children?: ReactNode;
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback
        className={cn("text-[length:inherit]", solid && "bg-primary text-primary-foreground")}
      >
        {bot.avatar || bot.name.charAt(0).toUpperCase()}
      </AvatarFallback>
      {children}
    </Avatar>
  );
}
