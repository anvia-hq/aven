import type { GithubPullDetail } from "@aven/github/types";
import type { ThreadPullRequestCheck } from "@aven/protocol/types";

import { githubService } from "../github/service";
import { projectsService } from "../projects/service";
import {
  PULL_REQUEST_FETCH_TIMEOUT_MS,
  summarizePullRequestChecks,
  within,
} from "./pull-request-view";
import type { ThreadPullRequest } from "./types";

const MAX_PULLS = 3;
const MAX_FAILING = 5;

type PullRequestChecksDeps = {
  getProject(
    organizationId: string,
    projectId: string,
  ): Promise<{ githubInstallationId: string | null; repoFullName: string | null } | null>;
  getPull(
    installationId: string,
    repoFullName: string,
    number: number,
  ): Promise<GithubPullDetail | null>;
  timeoutMs?: number;
};

const defaultDeps: PullRequestChecksDeps = {
  getProject: (organizationId, projectId) => projectsService.get(organizationId, projectId),
  getPull: (installationId, repoFullName, number) =>
    githubService.pull(installationId, repoFullName, number),
};

export async function threadPullRequestChecks(
  organizationId: string,
  thread: { projectId: string; pullRequests: readonly ThreadPullRequest[] },
  deps: PullRequestChecksDeps = defaultDeps,
): Promise<ThreadPullRequestCheck[]> {
  if (thread.pullRequests.length === 0) return [];

  const project = await deps.getProject(organizationId, thread.projectId);

  if (!project?.githubInstallationId || !project.repoFullName) return [];

  const timeoutMs = deps.timeoutMs ?? PULL_REQUEST_FETCH_TIMEOUT_MS;
  const pulls = thread.pullRequests.slice(0, MAX_PULLS);
  const results = await Promise.all(
    pulls.map(async (pull): Promise<ThreadPullRequestCheck | null> => {
      const detail = await within(
        deps.getPull(project.githubInstallationId!, project.repoFullName!, pull.number),
        timeoutMs,
      ).catch(() => null);

      if (!detail) return null;

      const checks = summarizePullRequestChecks(detail, MAX_FAILING);
      return {
        number: pull.number,
        url: pull.url,
        title: detail.title,
        state: detail.status,
        checksState: checks.state,
        failing: checks.failing,
      };
    }),
  );
  return results.flatMap((item) => (item ? [item] : []));
}
