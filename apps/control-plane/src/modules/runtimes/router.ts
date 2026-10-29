import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { connectRouter } from "./connect";
import { runGateway } from "./gateway";
import { runtimeHub } from "./hub";
import { createRuntimeBody, runtimeParams } from "./schema";
import { runtimesService } from "./service";

export const runtimesRouter = new Elysia({ prefix: "/runtimes" })
  .use(authRouter)
  .use(connectRouter(runtimeHub))
  .get(
    "/",
    async ({ organizationId }) => {
      const rows = await runtimesService.list(organizationId);
      return rows.map((runtime) => ({ ...runtime, online: runtimeHub.isOnline(runtime.id) }));
    },
    { auth: true, org: true },
  )
  // The response carries the connection token. It is shown once and cannot be read again.
  .post(
    "/",
    ({ body, organizationId, user }) => runtimesService.create(organizationId, user.id, body),
    { auth: true, org: true, body: createRuntimeBody },
  )
  // Where a run's model calls go; authenticated by the run's own token, not a session.
  .all(
    "/gateway/:segment/*",
    ({ request, params }) => runGateway.forward(request, params.segment, params["*"]),
    { parse: "none" },
  )
  .delete(
    "/:id",
    async ({ params, organizationId, user }) =>
      (await runtimesService.revoke(organizationId, user.id, params.id)) ??
      status(404, "Runtime not found"),
    { auth: true, org: true, params: runtimeParams },
  );
