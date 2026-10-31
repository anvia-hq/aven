import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { connectRouter } from "./connect";
import { runGateway } from "./gateway";
import type { RuntimeHub } from "./hub";
import { createRuntimeBody, runtimeParams } from "./schema";
import { runtimesService } from "./service";

export const runtimesRouter = (hub: RuntimeHub) =>
  new Elysia({ prefix: "/runtimes" })
    .use(authRouter)
    .use(connectRouter(hub))
    .get(
      "/",
      async ({ organizationId }) => {
        const rows = await runtimesService.list(organizationId);
        return rows.map((runtime) => ({ ...runtime, online: hub.isOnline(runtime.id) }));
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
    // Owner only. The old token stops working immediately and the runtime is cut off; the
    // response carries the new one once.
    .post(
      "/:id/rotate",
      async ({ params, organizationId, user }) => {
        const rotated = await runtimesService.rotate(organizationId, user.id, params.id);
        if (!rotated) return status(404, "Runtime not found");
        hub.disconnect(params.id, "Token rotated");
        return rotated;
      },
      { auth: true, org: true, params: runtimeParams },
    )
    .delete(
      "/:id",
      async ({ params, organizationId, user }) => {
        const revoked = await runtimesService.revoke(organizationId, user.id, params.id);
        if (!revoked) return status(404, "Runtime not found");
        hub.disconnect(params.id, "Revoked");
        return revoked;
      },
      { auth: true, org: true, params: runtimeParams },
    );
