import { Elysia } from "elysia";

import { orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import {
  addFolderBody,
  commitParams,
  commitsQuery,
  pullParams,
  folderQuery,
  importProjectBody,
  projectParams,
  trackedQuery,
  updateProjectBody,
} from "./schema";
import { projectsService } from "./service";
import type { PutAwayThread } from "../threads/types";
import type { ProjectFolders } from "./types";

export const projectsRouter = (putAway: PutAwayThread, folders: ProjectFolders) =>
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
    .post(
      "/folder",
      ({ body, organizationId, user }) => projectsService.addFolder(organizationId, user.id, body),
      { auth: true, org: true, body: addFolderBody },
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
      ({ params, query, organizationId, user }) =>
        projectsService.folder(organizationId, user.id, params.id, query.path, folders),
      { auth: true, org: true, params: projectParams, query: folderQuery },
    )
    .get(
      "/:id/readme",
      ({ params, organizationId, user }) =>
        projectsService.readme(organizationId, user.id, params.id, folders),
      {
        auth: true,
        org: true,
        params: projectParams,
      },
    )
    .get(
      "/:id/commits",
      ({ params, query, organizationId }) => {
        const { page, ...filters } = query;
        return projectsService.commits(organizationId, params.id, page, filters);
      },
      { auth: true, org: true, params: projectParams, query: commitsQuery },
    )
    .get(
      "/:id/pulls",
      ({ params, query, organizationId }) => {
        const { state, page, ...filters } = query;
        return projectsService.tracked(organizationId, params.id, "pull", state, page, filters);
      },
      { auth: true, org: true, params: projectParams, query: trackedQuery },
    )
    .get(
      "/:id/branches",
      ({ params, organizationId }) => projectsService.branches(organizationId, params.id),
      { auth: true, org: true, params: projectParams },
    )
    .get(
      "/:id/pulls/:number",
      ({ params, organizationId }) =>
        projectsService.pull(organizationId, params.id, params.number),
      { auth: true, org: true, params: pullParams },
    )
    .get(
      "/:id/commits/:sha",
      ({ params, organizationId }) => projectsService.commit(organizationId, params.id, params.sha),
      { auth: true, org: true, params: commitParams },
    )
    .get(
      "/:id/issues",
      ({ params, query, organizationId }) =>
        projectsService.tracked(organizationId, params.id, "issue", query.state, query.page),
      { auth: true, org: true, params: projectParams, query: trackedQuery },
    );
