import { useRequest } from "@/hooks/use-request";

import type { GithubAccount } from "../types";

export function useGithubAccount(appKey?: string | null) {
  const query = appKey ? `?app=${encodeURIComponent(appKey)}` : "";
  return useRequest<GithubAccount>(appKey === null ? null : `/github/user${query}`);
}
