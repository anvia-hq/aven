import { Elysia } from "elysia";

import { ForbiddenError } from "../../errors";
import { authRouter } from "../auth/router";
import { platformService } from "../platform/service";
import { saveServerDecisionBody, saveServerSmallBody } from "./schema";
import { serverModelsService } from "./service";

const ONLY_OWNERS = "Platform owners only";

async function requireOwner(user: { id: string; email: string }) {
  if (!(await platformService.isOwner(user))) throw new ForbiddenError(ONLY_OWNERS);
}

export const serverModelsRouter = new Elysia({ prefix: "/platform/server-models" })
  .use(authRouter)
  .get(
    "/",
    async ({ user }) => {
      await requireOwner(user);
      return serverModelsService.view();
    },
    { auth: true },
  )
  .put(
    "/decision",
    async ({ body, user }) => {
      await requireOwner(user);
      return serverModelsService.saveDecision(body);
    },
    { auth: true, body: saveServerDecisionBody },
  )
  .delete(
    "/decision",
    async ({ user }) => {
      await requireOwner(user);
      await serverModelsService.removeDecision();
      return { removed: true };
    },
    { auth: true },
  )
  .put(
    "/small",
    async ({ body, user }) => {
      await requireOwner(user);
      return serverModelsService.saveSmall(body);
    },
    { auth: true, body: saveServerSmallBody },
  )
  .delete(
    "/small",
    async ({ user }) => {
      await requireOwner(user);
      await serverModelsService.removeSmall();
      return { removed: true };
    },
    { auth: true },
  );
