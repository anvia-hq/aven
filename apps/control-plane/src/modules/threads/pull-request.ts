import { threadBranch } from "@aven/protocol/thread-branch";

import { githubService } from "../github/service";
import { projectsService } from "../projects/service";
import { threadsService, type ThreadPullRequest } from "./service";

type Deps = {
  thread: (organizationId: string, id: string) => Promise<{ projectId: string } | null>;
  project: (
    organizationId: string,
    projectId: string,
  ) => Promise<{ githubInstallationId: string; repoFullName: string } | null>;
  find: (
    installationRowId: string,
    fullName: string,
    branchPrefix: string,
  ) => Promise<ThreadPullRequest[]>;
  save: (threadId: string, pullRequests: ThreadPullRequest[]) => Promise<void>;
};

export function createPullRequestSync(deps: Deps) {
  return async (thread: { id: string; organizationId: string }) => {
    const row = await deps.thread(thread.organizationId, thread.id);
    if (!row) return [];
    const project = await deps.project(thread.organizationId, row.projectId);
    if (!project) return [];
    const found = await deps.find(
      project.githubInstallationId,
      project.repoFullName,
      threadBranch(thread.id),
    );
    await deps.save(thread.id, found);
    return found;
  };
}

export const syncPullRequest = createPullRequestSync({
  thread: (organizationId, id) => threadsService.get(organizationId, id),
  project: (organizationId, projectId) => projectsService.get(organizationId, projectId),
  find: (installationRowId, fullName, branchPrefix) =>
    githubService.findPullRequests(installationRowId, fullName, branchPrefix),
  save: (threadId, pullRequests) => threadsService.savePullRequests(threadId, pullRequests),
});
