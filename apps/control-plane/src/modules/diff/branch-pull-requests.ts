import type { ThreadPullRequest } from "../threads/types";

type Deps = {
  branch: (organizationId: string, threadId: string) => Promise<string | null>;
  project: (
    organizationId: string,
    threadId: string,
  ) => Promise<{ githubInstallationId: string | null; repoFullName: string | null } | null>;
  find: (
    installationRowId: string,
    fullName: string,
    branch: string,
  ) => Promise<ThreadPullRequest[] | null>;
  save: (threadId: string, pullRequests: ThreadPullRequest[]) => Promise<void>;
};

export function createBranchPullRequests(deps: Deps) {
  return async (organizationId: string, threadId: string) => {
    const branch = await deps.branch(organizationId, threadId);
    const project = branch ? await deps.project(organizationId, threadId) : null;

    if (!branch || !project?.githubInstallationId || !project.repoFullName) {
      return { branch: null, pullRequests: [] as ThreadPullRequest[] };
    }

    const found = await deps.find(project.githubInstallationId, project.repoFullName, branch);

    if (found === null) return { branch: null, pullRequests: [] as ThreadPullRequest[] };

    await deps.save(threadId, found);
    return { branch, pullRequests: found };
  };
}
