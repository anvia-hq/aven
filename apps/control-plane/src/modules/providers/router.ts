import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { createProviderBody, listModelsBody, providerParams, updateProviderBody } from "./schema";
import { listAgentModels, providersService } from "./service";

// Providers belong to the signed-in user, not to the active organization, so no `org: true`.
export const providersRouter = new Elysia({ prefix: "/providers" })
  .use(authRouter)
  .get("/", ({ user }) => providersService.list(user.id), { auth: true })
  .post("/", ({ body, user }) => providersService.create(user.id, body), {
    auth: true,
    body: createProviderBody,
  })
  .post("/models", async ({ body }) => ({ models: await listAgentModels(body) }), {
    auth: true,
    body: listModelsBody,
  })
  .get(
    "/:id/models",
    // `efforts` maps a model id to the reasoning levels it accepts; absent means none.
    async ({ params, user }) =>
      (await providersService.listModels(user.id, params.id)) ?? status(404, "Provider not found"),
    { auth: true, params: providerParams },
  )
  .patch(
    "/:id",
    async ({ params, body, user }) =>
      (await providersService.update(user.id, params.id, body)) ??
      status(404, "Provider not found"),
    { auth: true, params: providerParams, body: updateProviderBody },
  )
  .delete(
    "/:id",
    async ({ params, user }) =>
      (await providersService.remove(user.id, params.id))
        ? { ok: true }
        : status(404, "Provider not found"),
    { auth: true, params: providerParams },
  );
