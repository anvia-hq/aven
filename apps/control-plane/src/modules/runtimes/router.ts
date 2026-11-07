import { Elysia } from "elysia";

import { ForbiddenError, orNotFound } from "../../errors";
import { isOwnerOrAdmin } from "../auth/members";
import { authRouter } from "../auth/router";
import { isBehind, serverBuild } from "./build";
import { connectRouter } from "./connect";
import { createLatestRelease } from "./latest-release";
import { runGateway } from "./gateway";
import type { RuntimeHub } from "./hub";
import { createRuntimeBody, runtimeParams, updateRuntimeBody } from "./schema";
import { requestUpdate } from "./update";
import { updateTarget } from "./update-target";
import { LOCAL_RUNTIME_ID, runtimesService } from "./service";
import type { LatestRelease } from "./types";

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
              build,
              outdated: isBehind(build ?? undefined, server),
              isControlPlane: runtime.id === LOCAL_RUNTIME_ID,
              updateTo: await updateTarget(
                { build: build ?? undefined, isControlPlane: runtime.id === LOCAL_RUNTIME_ID },
                server,
                latest,
              ),
              canUpdate: hub.canUpdateOf(runtime.id),
              stats: hub.statsOf(runtime.id) ?? null,
            };
          }),
        );
      },
      { auth: true, org: true },
    )
    .post(
      "/",
      ({ body, organizationId, user }) => runtimesService.create(organizationId, user.id, body),
      { auth: true, org: true, body: createRuntimeBody },
    )
    .all(
      "/gateway/:segment/*",
      ({ request, params }) => runGateway.forward(request, params.segment, params["*"]),
      { parse: "none" },
    )
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
    .post(
      "/:id/update",
      async ({ params, body, organizationId, user, set }) => {
        if (!(await isOwnerOrAdmin(organizationId, user.id)))
          throw new ForbiddenError("Only an owner or an admin can update a runner");
        const runtime = orNotFound(
          await runtimesService.get(organizationId, params.id),
          "Runtime not found",
        );
        const release = await updateTarget(
          { build: hub.buildOf(runtime.id), isControlPlane: runtime.id === LOCAL_RUNTIME_ID },
          serverBuild(),
          latest,
        );
        const result = await requestUpdate(hub, runtime.id, release, body?.release);
        set.status = 202;
        return result;
      },
      { auth: true, org: true, params: runtimeParams, body: updateRuntimeBody },
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
