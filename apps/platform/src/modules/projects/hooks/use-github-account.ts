import { useRequest } from "@/hooks/use-request";

import type { GithubAccount } from "../types";

// Whether the person has connected their own GitHub account for an app, which shipping a thread
// acts as (decisions 0041 and 0123): the app a project is of, or the workspace's when none is
// given. Nothing is asked while `appKey` is null, and the answer is null until it is in.
export function useGithubAccount(appKey?: string | null) {
  const query = appKey ? `?app=${encodeURIComponent(appKey)}` : "";
  return useRequest<GithubAccount>(appKey === null ? null : `/github/user${query}`);
}
