import { CodexDeviceError, codexDevice } from "@aven/codex/device-auth";
import { isModelApi } from "@aven/protocol/providers";
import { NotFoundError, UnprocessableError, orNotFound } from "@aven/server-kit/errors";
import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import {
  codexDevicePollBody,
  createProviderBody,
  listModelsBody,
  providerParams,
  updateProviderBody,
} from "./schema";
import { labelsByModel, listAgentModels } from "./model-list";
import { listedModels, providersService } from "./service";

async function withCodexDevice<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof CodexDeviceError) throw new UnprocessableError(error.message);

    throw error;
  }
}

export const providersRouter = new Elysia({ prefix: "/providers" })
  .use(authRouter)
  .get("/", ({ user }) => providersService.list(user.id), { auth: true })
  .post("/", ({ body, user }) => providersService.create(user.id, body), {
    auth: true,
    body: createProviderBody,
  })
  .post("/codex-device", () => withCodexDevice(() => codexDevice.start()), { auth: true })
  .post(
    "/codex-device/poll",
    async ({ body, user }) => {
      const polled = await withCodexDevice(() =>
        codexDevice.poll(body.deviceAuthId, body.userCode),
      );

      if (polled.status === "pending") return polled;

      const provider = body.providerId
        ? orNotFound(
            await providersService.update(user.id, body.providerId, { apiKey: polled.auth }),
            "Provider not found",
          )
        : await providersService.create(user.id, {
            kind: "codex-subscription",
            name: "Codex subscription",
            apiKey: polled.auth,
            modelId: body.modelId,
          });

      return { status: "done" as const, provider };
    },
    { auth: true, body: codexDevicePollBody },
  )
  .post(
    "/models",
    async ({ body }) => {
      const { kind, apiKey, baseUrl } = body;
      const catalog = listedModels(kind);

      if (catalog) return catalog;

      if (!isModelApi(kind)) return { models: [], labels: {} };

      const source = { kind, apiKey, baseUrl };
      const models = await listAgentModels(source);
      return { models, labels: await labelsByModel(source, models) };
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
