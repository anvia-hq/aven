import { Elysia } from "elysia";

import { NotFoundError } from "@aven/server-kit/errors";
import { authRouter } from "../auth/router";
import { saveClaudeSetupBody } from "./schema";
import { claudeSetupService } from "./service";

export const claudeSetupRouter = new Elysia({ prefix: "/claude-setup-token" })
  .use(authRouter)
  .get("/", ({ user }) => claudeSetupService.view(user.id), { auth: true })
  .put("/", ({ body, user }) => claudeSetupService.save(user.id, body.token), {
    auth: true,
    body: saveClaudeSetupBody,
  })
  .delete(
    "/",
    async ({ user }) => {
      if (!(await claudeSetupService.remove(user.id))) {
        throw new NotFoundError("No Claude setup token is set");
      }

      return { removed: true };
    },
    { auth: true },
  );
