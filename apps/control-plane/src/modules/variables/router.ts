import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { nameParams, projectParams, setVariableBody, variableParams } from "./schema";
import { variablesService, type Scope } from "./service";

const inProject = (organizationId: string, projectId: string, actorId: string): Scope => ({
  kind: "project",
  organizationId,
  projectId,
  actorId,
});

export const variablesRouter = new Elysia({ prefix: "/projects/:id/variables" })
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

// The organization's variables and a person's own (decision 0046): each answers with that scope's
// values only, and the merge a run gets exists nowhere in the API.
function scopeRoutes(kind: "workspace" | "personal") {
  const scopeOf = (organizationId: string, userId: string): Scope =>
    kind === "workspace"
      ? { kind, organizationId, actorId: userId }
      : { kind, organizationId, userId };
  return new Elysia({ prefix: `/${kind}` })
    .use(authRouter)
    .get(
      "/",
      ({ organizationId, user }) => variablesService.list(scopeOf(organizationId, user.id)),
      {
        auth: true,
        org: true,
      },
    )
    .put(
      "/:name",
      ({ params, body, organizationId, user }) =>
        variablesService.set(scopeOf(organizationId, user.id), params.name, body),
      { auth: true, org: true, params: nameParams, body: setVariableBody },
    )
    .delete(
      "/:name",
      async ({ params, organizationId, user, set }) => {
        await variablesService.remove(scopeOf(organizationId, user.id), params.name);
        set.status = 204;
      },
      { auth: true, org: true, params: nameParams },
    );
}

export const scopedVariablesRouter = new Elysia({ prefix: "/variables" })
  .use(scopeRoutes("workspace"))
  .use(scopeRoutes("personal"));
