import { useCallback, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import type { FileEntry, FolderResponse } from "../types";

const POLL_MS = 5_000;

export function useWorkspaceTree(threadId: string, expanded: string[], running: boolean) {
  const [folders, setFolders] = useState<Record<string, FileEntry[]>>({});
  const [available, setAvailable] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const wanted = useRef(expanded);
  wanted.current = expanded;

  const load = useCallback(
    async (path: string) => {
      try {
        const response = await api<FolderResponse>(
          `/threads/${threadId}/files?path=${encodeURIComponent(path)}`,
        );
        setAvailable(response.available);
        setProblem(null);
        if (response.available) setFolders((current) => ({ ...current, [path]: response.entries }));
      } catch (failure) {
        setProblem(errorMessage(failure));
      }
    },
    [threadId],
  );

  const refresh = useCallback(
    () => Promise.all(["", ...wanted.current].map((path) => load(path))),
    [load],
  );

  useEffect(() => {
    void refresh();
    const timer = running ? setInterval(() => void refresh(), POLL_MS) : undefined;
    return () => clearInterval(timer);
  }, [refresh, running]);

  useEffect(() => {
    for (const path of expanded) if (!(path in folders)) void load(path);
  }, [expanded, folders, load]);

  return { folders, available, problem, refresh };
}
