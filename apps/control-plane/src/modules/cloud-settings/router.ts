import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { requirePlatformOwner } from "../platform/owner";
import { saveCloudSettingsBody } from "./schema";
import { cloudSettingsService } from "./service";

export const cloudSettingsRouter = new Elysia({ prefix: "/platform/cloud" })
  .use(authRouter)
  .get(
    "/",
    async ({ user }) => {
      await requirePlatformOwner(user);
      return cloudSettingsService.view();
    },
    { auth: true },
  )
  .put(
    "/",
    async ({ body, user }) => {
      await requirePlatformOwner(user);
      return cloudSettingsService.save(body);
    },
    { auth: true, body: saveCloudSettingsBody },
  )
  .delete(
    "/",
    async ({ user }) => {
      await requirePlatformOwner(user);
      await cloudSettingsService.remove();
      return { removed: true };
    },
    { auth: true },
  );
