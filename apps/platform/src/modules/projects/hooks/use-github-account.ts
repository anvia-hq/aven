import { useRequest } from "@/hooks/use-request";

import type { GithubAccount } from "../types";

export function useGithubAccount() {
  return useRequest<GithubAccount>("/github/user");
}
