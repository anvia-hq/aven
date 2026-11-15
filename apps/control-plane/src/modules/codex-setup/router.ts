import { Elysia } from "elysia";

import { NotFoundError } from "@aven/server-kit/errors";
import { authRouter } from "../auth/router";
import { saveCodexSetupBody } from "./schema";
import { codexSetupService } from "./service";

export const codexSetupRouter = new Elysia({ prefix: "/codex-setup-token" })
  .use(authRouter)
  .get("/", ({ user }) => codexSetupService.view(user.id), { auth: true })
  .put("/", ({ body, user }) => codexSetupService.save(user.id, body.token), {
    auth: true,
    body: saveCodexSetupBody,
  })
  .delete(
    "/",
    async ({ user }) => {
      if (!(await codexSetupService.remove(user.id))) {
        throw new NotFoundError("No Codex API key is set");
      }

      return { removed: true };
    },
    { auth: true },
  );
