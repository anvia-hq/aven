import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { projectParams, setVariableBody, variableParams } from "./schema";
import { variablesService, type Scope } from "./service";

const inProject = (organizationId: string, projectId: string): Scope => ({
  kind: "project",
  organizationId,
  projectId,
});

export const variablesRouter = new Elysia({ prefix: "/projects/:id/variables" })
  .use(authRouter)
  .get(
    "/",
    ({ params, organizationId }) => variablesService.list(inProject(organizationId, params.id)),
    {
      auth: true,
      org: true,
      params: projectParams,
    },
  )
  .put(
    "/:name",
    ({ params, body, organizationId }) =>
      variablesService.set(inProject(organizationId, params.id), params.name, body),
    { auth: true, org: true, params: variableParams, body: setVariableBody },
  )
  .delete(
    "/:name",
    async ({ params, organizationId, set }) => {
      await variablesService.remove(inProject(organizationId, params.id), params.name);
      set.status = 204;
    },
    { auth: true, org: true, params: variableParams },
  );
