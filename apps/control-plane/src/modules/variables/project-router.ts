import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { projectParams, setVariableBody, variableParams } from "./schema";
import { variablesService, type Scope } from "./service";

const inProject = (organizationId: string, projectId: string, actorId: string): Scope => ({
  kind: "project",
  organizationId,
  projectId,
  actorId,
});

// A project's variables (decision 0046), on its page.
export const projectVariablesRouter = new Elysia({ prefix: "/projects/:id/variables" })
  .use(authRouter)
  .get(
    "/",
    ({ params, organizationId, user }) =>
      variablesService.list(inProject(organizationId, params.id, user.id)),
    {
      auth: true,
      org: true,
      params: projectParams,
    },
  )
  .get(
    "/history",
    ({ params, organizationId, user }) =>
      variablesService.history(inProject(organizationId, params.id, user.id)),
    { auth: true, org: true, params: projectParams },
  )
  .put(
    "/:name",
    ({ params, body, organizationId, user }) =>
      variablesService.set(inProject(organizationId, params.id, user.id), params.name, body),
    { auth: true, org: true, params: variableParams, body: setVariableBody },
  )
  .delete(
    "/:name",
    async ({ params, organizationId, user, set }) => {
      await variablesService.remove(inProject(organizationId, params.id, user.id), params.name);
      set.status = 204;
    },
    { auth: true, org: true, params: variableParams },
  );
