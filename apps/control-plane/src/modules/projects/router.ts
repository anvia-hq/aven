import { Elysia } from "elysia";

import { orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import { importProjectBody, projectParams } from "./schema";
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
  );
