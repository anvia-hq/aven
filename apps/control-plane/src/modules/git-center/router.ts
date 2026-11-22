import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import type { RunManager } from "../runs/service";
import type { createThreadMessages } from "../threads/messages";
import {
  checkLogParams,
  commitParams,
  createPullBody,
  gitActionBody,
  handoffBody,
  mergePullBody,
  projectParams,
  pullParams,
  reflogQuery,
  reviewPullBody,
  snapshotQuery,
  updatePullStateBody,
  workspaceQuery,
} from "./schema";
import { createGitCenterService } from "./service";

export const gitCenterRouter = (
  hub: RuntimeHub,
  runs: Pick<RunManager, "isRunning">,
  messages: ReturnType<typeof createThreadMessages>,
) => {
  const service = createGitCenterService(hub, runs, messages);
  return new Elysia({ prefix: "/git-center" })
    .use(authRouter)
    .get(
      "/projects/:projectId/snapshot",
      ({ params, query, organizationId, user }) =>
        service.snapshot({ organizationId, userId: user.id }, params.projectId, query),
      { auth: true, org: true, params: projectParams, query: snapshotQuery },
    )
    .get(
      "/projects/:projectId/commits/:sha",
      ({ params, organizationId, user }) =>
        service.commitDiff({ organizationId, userId: user.id }, params.projectId, params.sha),
      { auth: true, org: true, params: commitParams },
    )
    .get(
      "/projects/:projectId/workspace",
      ({ params, query, organizationId, user }) =>
        service.workspace({ organizationId, userId: user.id }, params.projectId, query),
      { auth: true, org: true, params: projectParams, query: workspaceQuery },
    )
    .get(
      "/projects/:projectId/reflog",
      ({ params, query, organizationId, user }) =>
        service.reflog({ organizationId, userId: user.id }, params.projectId, query),
      { auth: true, org: true, params: projectParams, query: reflogQuery },
    )
    .post(
      "/projects/:projectId/actions",
      ({ params, body, organizationId, user }) =>
        service.action({ organizationId, userId: user.id }, params.projectId, body),
      { auth: true, org: true, params: projectParams, body: gitActionBody },
    )
    .get(
      "/projects/:projectId/pulls/:number",
      ({ params, organizationId, user }) =>
        service.pullDetail({ organizationId, userId: user.id }, params.projectId, params.number),
      { auth: true, org: true, params: pullParams },
    )
    .get(
      "/projects/:projectId/pulls/:number/checks/:checkRunId/logs",
      ({ params, organizationId, user }) =>
        service.checkLogs({ organizationId, userId: user.id }, params.projectId, params.checkRunId),
      { auth: true, org: true, params: checkLogParams },
    )
    .post(
      "/projects/:projectId/pulls",
      ({ params, body, organizationId, user }) =>
        service.createPull({ organizationId, userId: user.id }, params.projectId, body),
      { auth: true, org: true, params: projectParams, body: createPullBody },
    )
    .post(
      "/projects/:projectId/pulls/:number/review",
      ({ params, body, organizationId, user }) =>
        service.reviewPull(
          { organizationId, userId: user.id },
          params.projectId,
          params.number,
          body,
        ),
      { auth: true, org: true, params: pullParams, body: reviewPullBody },
    )
    .post(
      "/projects/:projectId/pulls/:number/merge",
      ({ params, body, organizationId, user }) =>
        service.mergePull(
          { organizationId, userId: user.id },
          params.projectId,
          params.number,
          body,
        ),
      { auth: true, org: true, params: pullParams, body: mergePullBody },
    )
    .post(
      "/projects/:projectId/pulls/:number/update-branch",
      ({ params, organizationId, user }) =>
        service.updatePullBranch(
          { organizationId, userId: user.id },
          params.projectId,
          params.number,
        ),
      { auth: true, org: true, params: pullParams },
    )
    .patch(
      "/projects/:projectId/pulls/:number",
      ({ params, body, organizationId, user }) =>
        service.updatePullState(
          { organizationId, userId: user.id },
          params.projectId,
          params.number,
          body,
        ),
      { auth: true, org: true, params: pullParams, body: updatePullStateBody },
    )
    .post(
      "/projects/:projectId/handoff",
      ({ params, body, organizationId, user }) =>
        service.handoff({ organizationId, userId: user.id }, params.projectId, body),
      { auth: true, org: true, params: projectParams, body: handoffBody },
    );
};
