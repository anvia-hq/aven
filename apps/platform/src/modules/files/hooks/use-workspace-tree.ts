import { useCallback, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import type { FileEntry, FolderResponse } from "../types";

const POLL_MS = 5_000;

// The folders of a thread's workspace that are open, read as they are opened and again as the
// agent works: while a run goes on they are looked at every few seconds, and once more when it
// ends. What was shown stays until the new answer arrives.
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

  // The top, and every folder left open, now and whenever a run starts or ends.
  useEffect(() => {
    void refresh();
    const timer = running ? setInterval(() => void refresh(), POLL_MS) : undefined;
    return () => clearInterval(timer);
  }, [refresh, running]);

  // A folder opened since: it is read once, not every time anything else changes.
  useEffect(() => {
    for (const path of expanded) if (!(path in folders)) void load(path);
  }, [expanded, folders, load]);

  return { folders, available, problem, refresh };
}
