import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { requirePlatformOwner } from "../platform/owner";
import { saveLensBody } from "./schema";
import { lensSettingsService } from "./service";

export const lensRouter = new Elysia({ prefix: "/platform/lens" })
  .use(authRouter)
  .get(
    "/",
    async ({ user }) => {
      await requirePlatformOwner(user);
      return lensSettingsService.view();
    },
    { auth: true },
  )
  .put(
    "/",
    async ({ body, user }) => {
      await requirePlatformOwner(user);
      return lensSettingsService.save(body);
    },
    { auth: true, body: saveLensBody },
  )
  .delete(
    "/",
    async ({ user }) => {
      await requirePlatformOwner(user);
      await lensSettingsService.remove();
      return { removed: true };
    },
    { auth: true },
  );
