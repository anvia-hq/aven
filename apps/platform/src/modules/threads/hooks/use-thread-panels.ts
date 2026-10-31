import { useLocalStorage } from "@/hooks/use-local-storage";

function usePanel(key: string, initial: boolean) {
  const [open, setOpen] = useLocalStorage(key, initial);
  return { open, toggle: () => setOpen(!open), close: () => setOpen(false) };
}

// Which panels are open beside a thread, remembered. The overview is on until closed; the others
// open when asked for.
export function useThreadPanels() {
  const overview = usePanel("aven.overview-open", true);
  const desktop = usePanel("aven.desktop-open", false);
  const diff = usePanel("aven.diff-open", false);
  const files = usePanel("aven.files-open", false);
  const terminal = usePanel("aven.terminal-open", false);
  return { overview, desktop, diff, files, terminal };
}

export type ThreadPanels = ReturnType<typeof useThreadPanels>;
