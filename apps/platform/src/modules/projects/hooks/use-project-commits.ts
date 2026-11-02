import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import type { RepoCommitPage } from "../types";

type Answer = { key: string; page?: RepoCommitPage; problem?: string };

// One page of the project's commit history on GitHub, from the newest, read again when the page
// changes. Until the answer for this page is in, `loading` is true, never the last page's commits.
export function useProjectCommits(projectId: string, page: number) {
  const [answer, setAnswer] = useState<Answer>();
  const key = `${projectId}\n${page}`;

  useEffect(() => {
    let current = true;
    api<RepoCommitPage>(`/projects/${projectId}/commits?page=${page}`)
      .then((found) => current && setAnswer({ key, page: found }))
      .catch((failure: unknown) => current && setAnswer({ key, problem: errorMessage(failure) }));
    return () => {
      current = false;
    };
  }, [projectId, page, key]);

  const mine = answer?.key === key ? answer : undefined;
  return {
    commits: mine?.page?.commits,
    hasMore: mine?.page?.hasMore ?? false,
    problem: mine?.problem,
    loading: mine === undefined,
  };
}
