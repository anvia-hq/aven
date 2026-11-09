import { useRequest } from "@/hooks/use-request";

import type { ShipBranchPulls, ThreadPullRequest } from "../types";

type Answer = { branch: string | null; pullRequests: ThreadPullRequest[] };

export function useBranchPullRequests(
  threadId: string,
  enabled: boolean,
  running: boolean,
): ShipBranchPulls {
  const answer = useRequest<Answer>(enabled ? `/threads/${threadId}/branch-pull-requests` : null, {
    resetOn: threadId,
    refreshKey: running,
  });
  return {
    loaded: answer !== null,
    problem: answer?.error ?? null,
    known: answer?.data?.branch != null,
    any: (answer?.data?.pullRequests.length ?? 0) > 0,
  };
}
