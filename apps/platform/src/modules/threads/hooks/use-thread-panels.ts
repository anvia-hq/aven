import { usePanel } from "@/hooks/use-panel";
import { forgetStoredKeysStartingWith, registerUserState } from "@/lib/user-state";

const THREAD_PREFIX = "aven.thread.";
const LAYOUT_PREFIX = `react-resizable-panels:${THREAD_PREFIX}`;

registerUserState(() => {
  forgetStoredKeysStartingWith(THREAD_PREFIX);
  forgetStoredKeysStartingWith(LAYOUT_PREFIX);
});

export function useThreadPanels(threadId: string) {
  const key = (name: string) => `${THREAD_PREFIX}${threadId}.${name}-open`;
  const overview = usePanel(key("overview"), true);
  const diff = usePanel(key("diff"), false);
  const files = usePanel(key("files"), false);
  const terminal = usePanel(key("terminal"), false);
  const preview = usePanel(key("preview"), false);
  return { overview, diff, files, terminal, preview };
}
