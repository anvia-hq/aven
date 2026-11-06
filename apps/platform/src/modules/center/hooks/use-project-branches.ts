import { useRequest } from "@/hooks/use-request";

import type { BranchList } from "../types";

// The branches of one project (nothing is asked for none), read when it is chosen and again on
// `refreshKey`: each branch costs GitHub a call or two, so they are not polled.
export function useProjectBranches(projectId: string | undefined, refreshKey: number) {
  return useRequest<BranchList>(projectId ? `/projects/${projectId}/branches` : null, {
    refreshKey,
  });
}
