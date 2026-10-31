import { Elysia } from "elysia";

import { orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import { botParams, updateBotBody } from "./schema";
import { botsService } from "./service";

// Bots belong to the signed-in user, not to the active organization, so no `org: true`.
export const botsRouter = new Elysia({ prefix: "/bots" })
  .use(authRouter)
  .get("/", ({ user }) => botsService.list(user.id), { auth: true })
  .patch(
    "/:id",
    async ({ params, body, user }) =>
      orNotFound(await botsService.update(user.id, params.id, body), "Bot not found"),
    { auth: true, params: botParams, body: updateBotBody },
  );
