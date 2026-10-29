import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { browseQuery, createDirectoryBody, createProjectBody, projectParams } from "./schema";
import {
  DirectoryExistsError,
  InvalidFolderNameError,
  InvalidProjectPathError,
} from "@aven/agents/workspace";

import { RuntimeOfflineError } from "../runtimes/hub";
import { DuplicateProjectPathError, RuntimeNotFoundError, projectsService } from "./service";

// Errors the folder picker and project creation can raise, as HTTP statuses.
function failure(error: unknown) {
  if (error instanceof InvalidProjectPathError) return status(422, error.message);
  if (error instanceof InvalidFolderNameError) return status(422, error.message);
  if (error instanceof RuntimeNotFoundError) return status(422, error.message);
  if (error instanceof DirectoryExistsError) return status(409, error.message);
  if (error instanceof DuplicateProjectPathError) return status(409, error.message);
  if (error instanceof RuntimeOfflineError) return status(503, error.message);
  throw error;
}

export const projectsRouter = new Elysia({ prefix: "/projects" })
  .use(authRouter)
  .get("/", ({ organizationId }) => projectsService.list(organizationId), {
    auth: true,
    org: true,
  })
  .get(
    "/browse",
    async ({ query, organizationId }) => {
      try {
        return await projectsService.browse(organizationId, query.runtimeId, query.path);
      } catch (error) {
        return failure(error);
      }
    },
    { auth: true, org: true, query: browseQuery },
  )
  .post(
    "/browse",
    async ({ body, organizationId }) => {
      try {
        return await projectsService.createDirectory(
          organizationId,
          body.runtimeId,
          body.path,
          body.name,
        );
      } catch (error) {
        return failure(error);
      }
    },
    { auth: true, org: true, body: createDirectoryBody },
  )
  .post(
    "/",
    async ({ body, organizationId, user }) => {
      try {
        return await projectsService.create(organizationId, user.id, body);
      } catch (error) {
        return failure(error);
      }
    },
    { auth: true, org: true, body: createProjectBody },
  )
  .get(
    "/:id",
    async ({ params, organizationId }) => {
      const project = await projectsService.get(organizationId, params.id);
      return project ?? status(404, "Project not found");
    },
    { auth: true, org: true, params: projectParams },
  );
