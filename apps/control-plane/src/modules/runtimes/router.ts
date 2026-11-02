import { Elysia } from "elysia";

import { orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import { isBehind, serverBuild } from "./build";
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
        const server = serverBuild();
        return rows.map((runtime) => {
          const build = hub.buildOf(runtime.id) ?? null;
          return {
            ...runtime,
            online: hub.isOnline(runtime.id),
            // The release the runner says it is, and whether it is behind this server's.
            build,
            outdated: isBehind(build ?? undefined, server),
            // How loaded its machine was when it last said; null while offline or if it never does.
            stats: hub.statsOf(runtime.id) ?? null,
          };
        });
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
        const rotated = orNotFound(
          await runtimesService.rotate(organizationId, user.id, params.id),
          "Runtime not found",
        );
        hub.disconnect(params.id, "Token rotated");
        return rotated;
      },
      { auth: true, org: true, params: runtimeParams },
    )
    .delete(
      "/:id",
      async ({ params, organizationId, user }) => {
        const revoked = orNotFound(
          await runtimesService.revoke(organizationId, user.id, params.id),
          "Runtime not found",
        );
        hub.disconnect(params.id, "Revoked");
        return revoked;
      },
      { auth: true, org: true, params: runtimeParams },
    );
