import { useState } from "react";

import { useRequest } from "@/hooks/use-request";

import type { GithubInstallation, GithubRepository, GithubStatus } from "../types";

export function useGithubRepositories(enabled: boolean) {
  const status = useRequest<GithubStatus>(enabled ? "/github" : null);
  const installations = useRequest<GithubInstallation[]>(enabled ? "/github/installations" : null);
  const [installationId, setInstallationId] = useState("");
  const chosen = installationId || installations?.data?.[0]?.id || "";
  const repositories = useRequest<GithubRepository[]>(
    chosen ? `/github/installations/${chosen}/repositories` : null,
  );

  return {
    loaded: status !== null && installations !== null,
    configured: status?.data?.configured ?? false,
    installUrl: status?.data?.installUrl ?? null,
    installations: installations?.data ?? [],
    installation: chosen,
    chooseInstallation: setInstallationId,
    repositories: repositories?.data ?? [],
    repositoriesLoaded: repositories !== null,
    repositoriesError: repositories?.error ?? null,
  };
}
