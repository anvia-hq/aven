import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { githubService } from "../github/service";
import { projectsService } from "../projects/service";
import { threadsService } from "../threads/service";
import { createBranchPullRequests } from "./branch-pull-requests";
import { diffQuery } from "./schema";
import { createDiffService } from "./service";

export const diffRouter = (hub: RuntimeHub) => {
  const service = createDiffService(hub);
  const branchPullRequests = createBranchPullRequests({
    branch: async (organizationId, threadId) => {
      const diff = await service.get(organizationId, threadId, "all");
      return diff.available ? (diff.branch ?? null) : null;
    },
    project: async (organizationId, threadId) => {
      const thread = await threadsService.get(organizationId, threadId);
      return thread ? projectsService.get(organizationId, thread.projectId) : null;
    },
    find: (installationRowId, fullName, branch) =>
      githubService.branchPullRequests(installationRowId, fullName, branch),
    save: (threadId, pullRequests) => threadsService.savePullRequests(threadId, pullRequests),
  });
  return new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get(
      "/:id/diff",
      ({ params, query, organizationId }) => service.get(organizationId, params.id, query.scope),
      {
        thread: "read",
        params: threadParams,
        query: diffQuery,
      },
    )
    .get(
      "/:id/branch-pull-requests",
      ({ params, organizationId }) => branchPullRequests(organizationId, params.id),
      { thread: "own", params: threadParams },
    );
};
