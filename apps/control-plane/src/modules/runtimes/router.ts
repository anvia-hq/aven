import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { createRuntimeBody, runtimeParams } from "./schema";
import { runtimesService } from "./service";

export const runtimesRouter = new Elysia({ prefix: "/runtimes" })
  .use(authRouter)
  .get("/", ({ organizationId }) => runtimesService.list(organizationId), {
    auth: true,
    org: true,
  })
  // The response carries the connection token. It is shown once and cannot be read again.
  .post(
    "/",
    ({ body, organizationId, user }) => runtimesService.create(organizationId, user.id, body),
    { auth: true, org: true, body: createRuntimeBody },
  )
  .delete(
    "/:id",
    async ({ params, organizationId, user }) =>
      (await runtimesService.revoke(organizationId, user.id, params.id)) ??
      status(404, "Runtime not found"),
    { auth: true, org: true, params: runtimeParams },
  );
