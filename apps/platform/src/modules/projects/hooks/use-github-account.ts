import { useRequest } from "@/hooks/use-request";

import type { GithubAccount } from "../types";

// Whether the person has connected their own GitHub account, which shipping a thread acts as
// (decision 0041). Null until the answer is in.
export function useGithubAccount() {
  return useRequest<GithubAccount>("/github/user");
}
