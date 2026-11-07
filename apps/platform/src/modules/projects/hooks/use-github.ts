import { useRequest } from "@/hooks/use-request";

import type { GithubInstallation, GithubRepo, GithubStatus } from "../types";

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
