import { usePanel } from "@/hooks/use-panel";

export function useBotPanels() {
  const desktop = usePanel("aven.bot-desktop-open", false);
  return { desktop };
}

export type BotPanels = ReturnType<typeof useBotPanels>;
