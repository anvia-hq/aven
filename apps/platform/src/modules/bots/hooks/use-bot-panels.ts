import { usePanel } from "@/hooks/use-panel";

// Which panels are open beside the bot's chat, remembered; they are the bot's own, apart from a
// thread's (decision 0059). Both start closed: the computer is not started until it is asked for.
export function useBotPanels() {
  const desktop = usePanel("aven.bot-desktop-open", false);
  const terminal = usePanel("aven.bot-terminal-open", false);
  return { desktop, terminal };
}

export type BotPanels = ReturnType<typeof useBotPanels>;
