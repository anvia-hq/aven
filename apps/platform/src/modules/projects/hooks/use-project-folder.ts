import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import type { RepoEntry } from "../types";

type Answer = { key: string; entries?: RepoEntry[]; problem?: string };

// A folder of the project's repository on GitHub (decision 0082), read again when the path
// changes. Until the answer for this path is in, `loading` is true, never the last path's entries.
export function useProjectFolder(projectId: string, path: string) {
  const [answer, setAnswer] = useState<Answer>();
  const key = `${projectId}\n${path}`;

  useEffect(() => {
    let current = true;
    api<{ entries: RepoEntry[] }>(`/projects/${projectId}/files?path=${encodeURIComponent(path)}`)
      .then(({ entries }) => current && setAnswer({ key, entries }))
      .catch((failure: unknown) => current && setAnswer({ key, problem: errorMessage(failure) }));
    return () => {
      current = false;
    };
  }, [projectId, path, key]);

  const mine = answer?.key === key ? answer : undefined;
  return { entries: mine?.entries, problem: mine?.problem, loading: mine === undefined };
}
