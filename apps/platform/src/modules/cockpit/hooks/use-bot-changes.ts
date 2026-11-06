import { useEffect } from "react";

import { useBotsWorking } from "@/modules/bots/hooks/use-bots-working";

import { refreshCockpitTags } from "./use-collection";
import { refreshInbox } from "./use-inbox";
import { refreshNotes } from "./use-notes";
import { refreshTasks } from "./use-tasks";

// How often the records are fetched again while a bot is at work, which may be changing them.
const WHILE_WORKING_MS = 5_000;

const refreshAll = () => {
  void refreshInbox();
  void refreshTasks();
  void refreshNotes();
  void refreshCockpitTags();
};

// A bot adds and changes the person's records on its own (decision 0109), and nothing tells the
// open cockpit: it fetches them again whenever the bots at work change, which includes the moment
// one finishes, and every few seconds while one works (decision 0121).
export function useBotChanges() {
  const working = useBotsWorking();
  const key = [...working].sort().join(",");

  useEffect(() => {
    refreshAll();
    if (!key) return undefined;
    const timer = setInterval(refreshAll, WHILE_WORKING_MS);
    return () => clearInterval(timer);
  }, [key]);
}
