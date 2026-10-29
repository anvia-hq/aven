import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { createProviderBody, listModelsBody, providerParams, updateProviderBody } from "./schema";
import { fetchModels, InvalidProviderError, ModelListError, providersService } from "./service";

// Providers belong to the signed-in user, not to the active organization, so no `org: true`.
export const providersRouter = new Elysia({ prefix: "/providers" })
  .use(authRouter)
  .get("/", ({ user }) => providersService.list(user.id), { auth: true })
  .post("/", ({ body, user }) => providersService.create(user.id, body), {
    auth: true,
    body: createProviderBody,
  })
  .post(
    "/models",
    async ({ body }) => {
      try {
        return { models: await fetchModels(body) };
      } catch (error) {
        if (error instanceof ModelListError) return status(422, error.message);
        throw error;
      }
    },
    { auth: true, body: listModelsBody },
  )
  .get(
    "/:id/models",
    async ({ params, user }) => {
      try {
        const models = await providersService.listModels(user.id, params.id);
        return models ? { models } : status(404, "Provider not found");
      } catch (error) {
        if (error instanceof ModelListError) return status(422, error.message);
        throw error;
      }
    },
    { auth: true, params: providerParams },
  )
  .patch(
    "/:id",
    async ({ params, body, user }) => {
      try {
        return (
          (await providersService.update(user.id, params.id, body)) ??
          status(404, "Provider not found")
        );
      } catch (error) {
        if (error instanceof InvalidProviderError) return status(422, error.message);
        throw error;
      }
    },
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
