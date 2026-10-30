import { useRequest } from "@/hooks/use-request";

import type { GithubInstallation, GithubRepo, GithubStatus } from "../types";

// What importing a repository needs from GitHub: whether it is set up, the organization's
// installations, and the repositories of the chosen one (the first until one is chosen). Nothing is
// requested until `enabled`.
export function useGithub(enabled: boolean, chosenInstallationId: string) {
  const status = useRequest<GithubStatus>(enabled ? "/github" : null);
  const installations = useRequest<GithubInstallation[]>(
    enabled && status?.data?.configured ? "/github/installations" : null,
  );
  const installationId = chosenInstallationId || installations?.data?.[0]?.id || "";
  const repos = useRequest<GithubRepo[]>(
    enabled && installationId ? `/github/installations/${installationId}/repos` : null,
  );
  return { status, installations, installationId, repos };
}
