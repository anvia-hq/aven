import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { requirePlatformOwner } from "../platform/owner";
import { saveServerDecisionBody, saveServerSmallBody } from "./schema";
import { serverModelsService } from "./service";

export const serverModelsRouter = new Elysia({ prefix: "/platform/server-models" })
  .use(authRouter)
  .get(
    "/",
    async ({ user }) => {
      await requirePlatformOwner(user);
      return serverModelsService.view();
    },
    { auth: true },
  )
  .put(
    "/decision",
    async ({ body, user }) => {
      await requirePlatformOwner(user);
      return serverModelsService.saveDecision(body);
    },
    { auth: true, body: saveServerDecisionBody },
  )
  .delete(
    "/decision",
    async ({ user }) => {
      await requirePlatformOwner(user);
      await serverModelsService.removeDecision();
      return { removed: true };
    },
    { auth: true },
  )
  .put(
    "/small",
    async ({ body, user }) => {
      await requirePlatformOwner(user);
      return serverModelsService.saveSmall(body);
    },
    { auth: true, body: saveServerSmallBody },
  )
  .delete(
    "/small",
    async ({ user }) => {
      await requirePlatformOwner(user);
      await serverModelsService.removeSmall();
      return { removed: true };
    },
    { auth: true },
  );
