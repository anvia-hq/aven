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

// The agent opens a thread's pull requests itself, with `gh` (decision 0044), so Aven learns of
// them by asking GitHub for the pull requests whose head is the thread's branch or one that starts
// with it (decision 0069), once a run has ended. It asks after every run, since a thread can ship
// again, and since a pull request's state changes (merged, closed). A failure is the caller's to
// log: it must not matter to the run that just ended.
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

/** The sync with Aven's own services. */
export const syncPullRequest = createPullRequestSync({
  thread: (organizationId, id) => threadsService.get(organizationId, id),
  project: (organizationId, projectId) => projectsService.get(organizationId, projectId),
  find: (installationRowId, fullName, branchPrefix) =>
    githubService.findPullRequests(installationRowId, fullName, branchPrefix),
  save: (threadId, pullRequests) => threadsService.savePullRequests(threadId, pullRequests),
});
