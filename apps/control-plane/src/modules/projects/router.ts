import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { createProjectBody, projectParams } from "./schema";
import { projectsService, RuntimeNotFoundError } from "./service";

export const projectsRouter = new Elysia({ prefix: "/projects" })
  .use(authRouter)
  .get("/", ({ organizationId }) => projectsService.list(organizationId), {
    auth: true,
    org: true,
  })
  .post(
    "/",
    async ({ body, organizationId, user }) => {
      try {
        return await projectsService.create(organizationId, user.id, body);
      } catch (error) {
        if (error instanceof RuntimeNotFoundError) return status(422, error.message);
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
