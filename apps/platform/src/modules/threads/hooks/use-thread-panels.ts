import { usePanel } from "@/hooks/use-panel";

export function useThreadPanels() {
  const overview = usePanel("aven.overview-open", true);
  const desktop = usePanel("aven.desktop-open", false);
  const diff = usePanel("aven.diff-open", false);
  const files = usePanel("aven.files-open", false);
  const terminal = usePanel("aven.terminal-open", false);
  return { overview, desktop, diff, files, terminal };
}

export type ThreadPanels = ReturnType<typeof useThreadPanels>;
