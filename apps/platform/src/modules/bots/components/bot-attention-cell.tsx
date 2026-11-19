import { Link, useRouterState } from "@tanstack/react-router";
import { useRef, type AnimationEvent } from "react";

import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "@aven/ui/tooltip";

import { ATTENTION_LABEL, WORKING_LABEL } from "../attention";
import type { Bot } from "../types";
import { BotAvatar } from "./bot-avatar";

const LOOK_CYCLES = 2;

export function BotAttentionCell({
  bot,
  working,
  onCycle,
}: {
  bot: Bot;
  working: boolean;
  onCycle?: () => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const cycles = useRef(0);
  const reason =
    (bot.attention ? ATTENTION_LABEL[bot.attention.reason] : null) ??
    (working ? WORKING_LABEL : null);
  const active = bot.isMain ? pathname === "/bot" : pathname === `/bot/${bot.id}`;
  const className = cn(
    "relative flex size-9 shrink-0 items-center justify-center rounded-xl outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-(--chrome) active:scale-95 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-reduce:transition-none",
    active && "bg-accent",
  );
  const label = reason ? `${bot.name}: ${reason}` : bot.name;
  const onIteration = (event: AnimationEvent<HTMLAnchorElement>) => {
    if (!onCycle) return;

    if (event.animationName === "bot-look") {
      cycles.current += 1;

      if (cycles.current < LOOK_CYCLES) return;
    } else if (event.animationName !== "bot-bob") return;

    cycles.current = 0;
    onCycle();
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          bot.isMain ? (
            <Link
              to="/bot"
              aria-label={label}
              className={className}
              onAnimationIteration={onIteration}
            />
          ) : (
            <Link
              to="/bot/$botId"
              params={{ botId: bot.id }}
              aria-label={label}
              className={className}
              onAnimationIteration={onIteration}
            />
          )
        }
      >
        <BotAvatar
          bot={bot}
          mood={working ? "working" : "idle"}
          steady
          className="size-5"
          delayMs={0}
        />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="pointer-events-none">
        {reason ? `${bot.name} · ${reason}` : bot.name}
      </TooltipContent>
    </Tooltip>
  );
}
