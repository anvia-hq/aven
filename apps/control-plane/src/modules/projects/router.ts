import { Elysia } from "elysia";

import { orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import {
  commitsQuery,
  folderQuery,
  importProjectBody,
  projectParams,
  trackedQuery,
} from "./schema";
import { projectsService } from "./service";

export const projectsRouter = new Elysia({ prefix: "/projects" })
  .use(authRouter)
  .get("/", ({ organizationId }) => projectsService.list(organizationId), {
    auth: true,
    org: true,
  })
  .post(
    "/",
    ({ body, organizationId, user }) => projectsService.import(organizationId, user.id, body),
    { auth: true, org: true, body: importProjectBody },
  )
  .get(
    "/:id",
    async ({ params, organizationId }) =>
      orNotFound(await projectsService.get(organizationId, params.id), "Project not found"),
    { auth: true, org: true, params: projectParams },
  )
  .get(
    "/:id/files",
    ({ params, query, organizationId }) =>
      projectsService.folder(organizationId, params.id, query.path),
    { auth: true, org: true, params: projectParams, query: folderQuery },
  )
  .get(
    "/:id/readme",
    ({ params, organizationId }) => projectsService.readme(organizationId, params.id),
    {
      auth: true,
      org: true,
      params: projectParams,
    },
  )
  .get(
    "/:id/commits",
    ({ params, query, organizationId }) =>
      projectsService.commits(organizationId, params.id, query.page),
    { auth: true, org: true, params: projectParams, query: commitsQuery },
  )
  .get(
    "/:id/pulls",
    ({ params, query, organizationId }) =>
      projectsService.tracked(organizationId, params.id, "pull", query.state, query.page),
    { auth: true, org: true, params: projectParams, query: trackedQuery },
  )
  .get(
    "/:id/issues",
    ({ params, query, organizationId }) =>
      projectsService.tracked(organizationId, params.id, "issue", query.state, query.page),
    { auth: true, org: true, params: projectParams, query: trackedQuery },
  );
