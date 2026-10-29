import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { createProjectBody, projectParams } from "./schema";
import { projectsService } from "./service";

export const projectsRouter = new Elysia({ prefix: "/projects" })
  .use(authRouter)
  .get("/", ({ organizationId }) => projectsService.list(organizationId), {
    auth: true,
    org: true,
  })
  .post(
    "/",
    ({ body, organizationId, user }) => projectsService.create(organizationId, user.id, body),
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
