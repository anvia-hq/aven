import { Elysia } from "elysia";

import { NotFoundError } from "../../errors";
import { authRouter } from "../auth/router";
import { saveCodexLoginBody } from "./schema";
import { codexSetupService } from "./service";

export const codexSetupRouter = new Elysia({ prefix: "/codex-login" })
  .use(authRouter)
  .get("/", ({ user }) => codexSetupService.view(user.id), { auth: true })
  .put("/", ({ body, user }) => codexSetupService.save(user.id, body), {
    auth: true,
    body: saveCodexLoginBody,
  })
  .delete(
    "/",
    async ({ user }) => {
      if (!(await codexSetupService.remove(user.id))) {
        throw new NotFoundError("No ChatGPT login is saved");
      }

      return { removed: true };
    },
    { auth: true },
  );
