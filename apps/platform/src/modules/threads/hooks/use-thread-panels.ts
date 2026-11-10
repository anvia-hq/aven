import { usePanel } from "@/hooks/use-panel";
import { forgetStoredKeys, registerUserState } from "@/lib/user-state";

const OVERVIEW_KEY = "aven.overview-open";
const DESKTOP_KEY = "aven.desktop-open";
const DIFF_KEY = "aven.diff-open";
const FILES_KEY = "aven.files-open";
const TERMINAL_KEY = "aven.terminal-open";
const BROWSER_KEY = "aven.browser-open";

registerUserState(() =>
  forgetStoredKeys([OVERVIEW_KEY, DESKTOP_KEY, DIFF_KEY, FILES_KEY, TERMINAL_KEY, BROWSER_KEY]),
);

export function useThreadPanels() {
  const overview = usePanel(OVERVIEW_KEY, true);
  const desktop = usePanel(DESKTOP_KEY, false);
  const diff = usePanel(DIFF_KEY, false);
  const files = usePanel(FILES_KEY, false);
  const terminal = usePanel(TERMINAL_KEY, false);
  const browser = usePanel(BROWSER_KEY, false);
  return { overview, desktop, diff, files, terminal, browser };
}
