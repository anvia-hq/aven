import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import type { TrackedKind, TrackedPage, TrackedState } from "../types";

type Answer = { key: string; page?: TrackedPage; problem?: string };

const PATH: Record<TrackedKind, string> = { pull: "pulls", issue: "issues" };

// One page of the project's pull requests or issues on GitHub, open or closed, read again when any
// of them changes. Until the answer for this very page is in, `loading` is true, never another
// page's items (decision 0092).
export function useProjectTracked(
  projectId: string,
  kind: TrackedKind,
  state: TrackedState,
  page: number,
) {
  const [answer, setAnswer] = useState<Answer>();
  const key = `${projectId}\n${kind}\n${state}\n${page}`;

  useEffect(() => {
    let current = true;
    api<TrackedPage>(`/projects/${projectId}/${PATH[kind]}?state=${state}&page=${page}`)
      .then((found) => current && setAnswer({ key, page: found }))
      .catch((failure: unknown) => current && setAnswer({ key, problem: errorMessage(failure) }));
    return () => {
      current = false;
    };
  }, [projectId, kind, state, page, key]);

  const mine = answer?.key === key ? answer : undefined;
  return {
    items: mine?.page?.items,
    total: mine?.page?.total,
    hasMore: mine?.page?.hasMore ?? false,
    problem: mine?.problem,
    loading: mine === undefined,
  };
}
