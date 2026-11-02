import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import type { RepoReadme } from "../types";

type Answer = { projectId: string; readme: RepoReadme | null; problem?: string };

// A project's README on GitHub (decision 0082): null once it is known to have none.
export function useProjectReadme(projectId: string) {
  const [answer, setAnswer] = useState<Answer>();

  useEffect(() => {
    let current = true;
    api<{ readme: RepoReadme | null }>(`/projects/${projectId}/readme`)
      .then(({ readme }) => current && setAnswer({ projectId, readme }))
      .catch(
        (failure: unknown) =>
          current && setAnswer({ projectId, readme: null, problem: errorMessage(failure) }),
      );
    return () => {
      current = false;
    };
  }, [projectId]);

  const mine = answer?.projectId === projectId ? answer : undefined;
  return { readme: mine?.readme, problem: mine?.problem, loading: mine === undefined };
}
