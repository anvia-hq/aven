import { Elysia } from "elysia";

import { orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import type { PutAwayThread } from "../threads/put-away";
import {
  commitsQuery,
  folderQuery,
  importProjectBody,
  projectParams,
  trackedQuery,
  updateProjectBody,
} from "./schema";
import { projectsService } from "./service";

// Deleting a project puts its threads away: it stops the runs they have and frees their sandboxes,
// which only the run manager and the runners can.
export const projectsRouter = (putAway: PutAwayThread) =>
  new Elysia({ prefix: "/projects" })
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
    .patch(
      "/:id",
      ({ params, body, organizationId, user }) =>
        projectsService.update(organizationId, user.id, params.id, body),
      { auth: true, org: true, params: projectParams, body: updateProjectBody },
    )
    .delete(
      "/:id",
      async ({ params, organizationId, user }) => {
        await projectsService.remove(organizationId, user.id, params.id, putAway);
        return { deleted: true };
      },
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
