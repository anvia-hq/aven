import { usePanel } from "@/hooks/use-panel";

// Whether the bot's desktop is open beside its chat, remembered apart from a thread's (decision
// 0059). It starts closed: the computer is not started until it is asked for.
export function useBotPanels() {
  const desktop = usePanel("aven.bot-desktop-open", false);
  return { desktop };
}

export type BotPanels = ReturnType<typeof useBotPanels>;
