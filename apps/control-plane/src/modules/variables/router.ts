import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { nameParams, setVariableBody } from "./schema";
import { variablesService } from "./service";
import type { Scope } from "./types";

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
    .get(
      "/history",
      ({ organizationId, user }) => variablesService.history(scopeOf(organizationId, user.id)),
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

export const variablesRouter = new Elysia({ prefix: "/variables" })
  .use(scopeRoutes("workspace"))
  .use(scopeRoutes("personal"));
