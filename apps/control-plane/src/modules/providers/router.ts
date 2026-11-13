import { Elysia } from "elysia";

import { NotFoundError, orNotFound } from "@aven/server-kit/errors";
import { authRouter } from "../auth/router";
import { createProviderBody, listModelsBody, providerParams, updateProviderBody } from "./schema";
import { labelsByModel, listAgentModels } from "./model-list";
import { providersService } from "./service";

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
      const models = await listAgentModels(body);
      return { models, labels: await labelsByModel(body, models) };
    },
    { auth: true, body: listModelsBody },
  )
  .get(
    "/:id/models",
    async ({ params, user }) =>
      orNotFound(await providersService.listModels(user.id, params.id), "Provider not found"),
    { auth: true, params: providerParams },
  )
  .patch(
    "/:id",
    async ({ params, body, user }) =>
      orNotFound(await providersService.update(user.id, params.id, body), "Provider not found"),
    { auth: true, params: providerParams, body: updateProviderBody },
  )
  .delete(
    "/:id",
    async ({ params, user }) => {
      if (!(await providersService.remove(user.id, params.id))) {
        throw new NotFoundError("Provider not found");
      }

      return { ok: true };
    },
    { auth: true, params: providerParams },
  );
