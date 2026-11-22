import { useEffect, useState } from "react";

import { BotLine } from "@/components/bot-line";
import { RailLink } from "@/components/rail-link";

import { attentionQueue } from "../attention";
import { useAttentionRotation } from "../hooks/use-attention-rotation";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { refreshBots, useBots } from "../hooks/use-bots";
import { useBotsWorking } from "../hooks/use-bots-working";
import { BotAttentionCell } from "./bot-attention-cell";
import { BotSwapParticles } from "./bot-swap-particles";

export function BotRailLink({ active }: { active: boolean }) {
  const { bots, main } = useBots();
  const working = useBotsWorking();
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const queue = attentionQueue(bots, working);
  const rotation = useAttentionRotation(queue.length, paused, reduced);
  const shown = queue[rotation.index];

  const busy = working.size > 0;
  const workingKey = [...working].sort().join(",");

  useEffect(() => {
    void refreshBots();
  }, [workingKey]);

  useEffect(() => {
    if (!busy) return;

    const timer = setInterval(() => void refreshBots(), 2_000);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    const refresh = () => void refreshBots();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(onVisibility, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(timer);
    };
  }, []);

  if (shown && queue.length > 1) {
    return (
      <div
        role="group"
        aria-label="Bots that need attention"
        className="relative flex size-9 shrink-0 items-center justify-center"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        {!reduced && <BotSwapParticles key={shown.id} />}
        <BotAttentionCell
          key={shown.id}
          bot={shown}
          working={working.has(shown.id)}
          onCycle={paused ? undefined : rotation.advance}
        />
      </div>
    );
  }

  return (
    <RailLink to="/bot" label="Bot" tooltip={main?.name ?? "Bot"} active={active}>
      <BotLine className="size-[17px]" />
    </RailLink>
  );
}
