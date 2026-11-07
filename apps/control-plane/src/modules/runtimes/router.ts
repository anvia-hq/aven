import { Elysia } from "elysia";

import { ForbiddenError, orNotFound } from "../../errors";
import { isOwnerOrAdmin } from "../auth/members";
import { authRouter } from "../auth/router";
import { isBehind, serverBuild } from "./build";
import { connectRouter } from "./connect";
import { createLatestRelease, type LatestRelease } from "./latest-release";
import { runGateway } from "./gateway";
import type { RuntimeHub } from "./hub";
import { createRuntimeBody, runtimeParams } from "./schema";
import { requestUpdate } from "./update";
import { updateTarget } from "./update-target";
import { LOCAL_RUNTIME_ID, runtimesService } from "./service";

export const runtimesRouter = (hub: RuntimeHub, latest: LatestRelease = createLatestRelease()) =>
  new Elysia({ prefix: "/runtimes" })
    .use(authRouter)
    .use(connectRouter(hub))
    .get(
      "/",
      async ({ organizationId }) => {
        const rows = await runtimesService.list(organizationId);
        const server = serverBuild();
        return Promise.all(
          rows.map(async (runtime) => {
            const build = hub.buildOf(runtime.id) ?? null;
            return {
              ...runtime,
              online: hub.isOnline(runtime.id),
              // The release the runner says it is, and whether it is behind this server's.
              build,
              outdated: isBehind(build ?? undefined, server),
              // The release its Update button would take it to: the server's, or for the control
              // plane's own runner a newer one on GitHub.
              updateTo: await updateTarget(
                { build: build ?? undefined, isControlPlane: runtime.id === LOCAL_RUNTIME_ID },
                server,
                latest,
              ),
              // An installed `aven` that can update itself when asked (decision 0146).
              canUpdate: hub.canUpdateOf(runtime.id),
              // How loaded its machine was when it last said; null while offline or if it never does.
              stats: hub.statsOf(runtime.id) ?? null,
            };
          }),
        );
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
    // An owner or an admin has the runner update itself to this server's release (decision 0146).
    // Answered when the runner has agreed, before it starts: the update restarts it.
    .post(
      "/:id/update",
      async ({ params, organizationId, user, set }) => {
        if (!(await isOwnerOrAdmin(organizationId, user.id)))
          throw new ForbiddenError("Only an owner or an admin can update a runner");
        const runtime = orNotFound(
          await runtimesService.get(organizationId, params.id),
          "Runtime not found",
        );
        const release =
          (await updateTarget(
            { build: hub.buildOf(runtime.id), isControlPlane: runtime.id === LOCAL_RUNTIME_ID },
            serverBuild(),
            latest,
          )) ?? serverBuild();
        const result = await requestUpdate(hub, runtime.id, release);
        set.status = 202;
        return result;
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
