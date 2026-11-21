import { useRequest } from "@/hooks/use-request";

import type { GithubStatus } from "../types";

export function useGithubStatus() {
  return useRequest<GithubStatus>("/github");
}
