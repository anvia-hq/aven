import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { browseQuery, createDirectoryBody, createProjectBody, projectParams } from "./schema";
import {
  DirectoryExistsError,
  DuplicateProjectPathError,
  InvalidFolderNameError,
  InvalidProjectPathError,
  projectsService,
} from "./service";

export const projectsRouter = new Elysia({ prefix: "/projects" })
  .use(authRouter)
  .get("/", ({ organizationId }) => projectsService.list(organizationId), {
    auth: true,
    org: true,
  })
  .get(
    "/browse",
    async ({ query }) => {
      try {
        return await projectsService.browse(query.path);
      } catch (error) {
        if (error instanceof InvalidProjectPathError) return status(422, error.message);
        throw error;
      }
    },
    { auth: true, org: true, query: browseQuery },
  )
  .post(
    "/browse",
    async ({ body }) => {
      try {
        return await projectsService.createDirectory(body.path, body.name);
      } catch (error) {
        if (error instanceof InvalidProjectPathError) return status(422, error.message);
        if (error instanceof InvalidFolderNameError) return status(422, error.message);
        if (error instanceof DirectoryExistsError) return status(409, error.message);
        throw error;
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
        if (error instanceof InvalidProjectPathError) return status(422, error.message);
        if (error instanceof DuplicateProjectPathError) return status(409, error.message);
        throw error;
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
