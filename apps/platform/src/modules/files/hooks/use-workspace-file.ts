import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import type { FileResponse } from "../types";

const POLL_MS = 5_000;

type Answer = { path: string } & ({ file: FileResponse } | { problem: string });

// One file of a thread's workspace, read when shown and again as the agent works on it.
export function useWorkspaceFile(threadId: string, path: string | null, running: boolean) {
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (path === null) return;
    // An answer that arrives after another file was picked is for the wrong one.
    let current = true;
    const look = async () => {
      try {
        const file = await api<FileResponse>(
          `/threads/${threadId}/files/content?path=${encodeURIComponent(path)}`,
        );
        if (current) setAnswer({ path, file });
      } catch (failure) {
        if (current) setAnswer({ path, problem: errorMessage(failure) });
      }
    };
    void look();
    const timer = running ? setInterval(() => void look(), POLL_MS) : undefined;
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [threadId, path, running]);

  const shown = answer?.path === path ? answer : null;
  return {
    loaded: shown !== null,
    file: shown && "file" in shown ? shown.file : null,
    problem: shown && "problem" in shown ? shown.problem : null,
  };
}
