import { threadBranch } from "@aven/protocol/thread-branch";

import { githubService } from "../github/service";
import { projectsService } from "../projects/service";
import { threadsService } from "../threads/service";

type Deps = {
  thread: (
    organizationId: string,
    id: string,
  ) => Promise<{
    projectId: string;
    pullRequestNumber: number | null;
  } | null>;
  project: (
    organizationId: string,
    projectId: string,
  ) => Promise<{ githubInstallationId: string; repoFullName: string } | null>;
  find: (
    installationRowId: string,
    fullName: string,
    head: string,
  ) => Promise<{ number: number; url: string } | null>;
  save: (threadId: string, pullRequest: { number: number; url: string }) => Promise<void>;
};

// The agent opens a thread's pull request itself, with `gh` (decision 0044), so Aven learns of it
// by asking GitHub for the pull request whose head is the thread's branch, once a run has ended.
// It stops asking for a thread once it has one. A failure is the caller's to log: it must not
// matter to the run that just ended.
export function createPullRequestSync(deps: Deps) {
  return async (thread: { id: string; organizationId: string }) => {
    const row = await deps.thread(thread.organizationId, thread.id);
    if (!row || row.pullRequestNumber !== null) return null;
    const project = await deps.project(thread.organizationId, row.projectId);
    if (!project) return null;
    const found = await deps.find(
      project.githubInstallationId,
      project.repoFullName,
      threadBranch(thread.id),
    );
    if (found) await deps.save(thread.id, found);
    return found;
  };
}

/** The sync with Aven's own services. */
export const syncPullRequest = createPullRequestSync({
  thread: (organizationId, id) => threadsService.get(organizationId, id),
  project: (organizationId, projectId) => projectsService.get(organizationId, projectId),
  find: (installationRowId, fullName, head) =>
    githubService.findPullRequest(installationRowId, fullName, head),
  save: (threadId, pullRequest) => threadsService.setPullRequest(threadId, pullRequest),
});
