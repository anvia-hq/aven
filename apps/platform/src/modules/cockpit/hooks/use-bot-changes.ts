import { useEffect } from "react";

import { useBotsWorking } from "@/modules/bots/hooks/use-bots-working";

import { refreshCockpitTags } from "./use-collection";
import { refreshInbox } from "./use-inbox";
import { refreshNotes } from "./use-notes";
import { refreshTasks } from "./use-tasks";

const WHILE_WORKING_MS = 5_000;

const refreshAll = () => {
  void refreshInbox();
  void refreshTasks();
  void refreshNotes();
  void refreshCockpitTags();
};

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
