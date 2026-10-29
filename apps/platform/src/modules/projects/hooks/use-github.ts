import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import type { GithubInstallation, GithubRepo, GithubStatus } from "../types";

type Loaded<T> = { data: T; error: null } | { data: null; error: string } | null;

function useRequest<T>(path: string | null): Loaded<T> {
  const [result, setResult] = useState<{ path: string; loaded: NonNullable<Loaded<T>> } | null>(
    null,
  );

  useEffect(() => {
    if (!path) return;
    let current = true;
    api<T>(path)
      .then((data) => current && setResult({ path, loaded: { data, error: null } }))
      .catch(
        (failure: unknown) =>
          current && setResult({ path, loaded: { data: null, error: errorMessage(failure) } }),
      );
    return () => {
      current = false;
    };
  }, [path]);

  // A result for an earlier path is not the answer to this one.
  return result?.path === path ? result.loaded : null;
}

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
