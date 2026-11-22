import { useCallback } from "react";

import { useLocalStorage } from "@aven/ui/use-local-storage";

const STORAGE_KEY = "aven:git-center:tabs";

const parseTabs = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function useGitTabs() {
  const [rawTabs, setRawTabs] = useLocalStorage<string[]>(STORAGE_KEY, []);
  const tabIds = parseTabs(rawTabs);

  const openTab = useCallback(
    (projectId: string) => {
      setRawTabs((prev) => {
        const list = parseTabs(prev);
        return list.includes(projectId) ? list : [...list, projectId];
      });
    },
    [setRawTabs],
  );

  const closeTab = useCallback(
    (projectId: string) => {
      setRawTabs((prev) => parseTabs(prev).filter((id) => id !== projectId));
    },
    [setRawTabs],
  );

  return { tabIds, openTab, closeTab };
}
