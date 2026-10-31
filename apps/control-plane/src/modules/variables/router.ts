import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { projectParams, setVariableBody, variableParams } from "./schema";
import { variablesService } from "./service";

export const variablesRouter = new Elysia({ prefix: "/projects/:id/variables" })
  .use(authRouter)
  .get("/", ({ params, organizationId }) => variablesService.list(organizationId, params.id), {
    auth: true,
    org: true,
    params: projectParams,
  })
  .put(
    "/:name",
    ({ params, body, organizationId }) =>
      variablesService.set(organizationId, params.id, params.name, body),
    { auth: true, org: true, params: variableParams, body: setVariableBody },
  )
  .delete(
    "/:name",
    async ({ params, organizationId, set }) => {
      await variablesService.remove(organizationId, params.id, params.name);
      set.status = 204;
    },
    { auth: true, org: true, params: variableParams },
  );
