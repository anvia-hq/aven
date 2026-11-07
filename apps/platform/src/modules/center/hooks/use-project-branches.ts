import { useRequest } from "@/hooks/use-request";

import type { BranchList } from "../types";

export function useProjectBranches(projectId: string | undefined, refreshKey: number) {
  return useRequest<BranchList>(projectId ? `/projects/${projectId}/branches` : null, {
    refreshKey,
  });
}
