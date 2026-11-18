import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { requirePlatformOwner } from "../platform/owner";
import { saveCloudLifecycleBody } from "./schema";
import { cloudLifecycleService } from "./service";

export const cloudLifecycleRouter = new Elysia({ prefix: "/platform/cloud/lifecycle" })
  .use(authRouter)
  .get(
    "/",
    async ({ user }) => {
      await requirePlatformOwner(user);
      return cloudLifecycleService.current();
    },
    { auth: true },
  )
  .put(
    "/",
    async ({ body, user }) => {
      await requirePlatformOwner(user);
      return cloudLifecycleService.save(body);
    },
    { auth: true, body: saveCloudLifecycleBody },
  )
  .delete(
    "/",
    async ({ user }) => {
      await requirePlatformOwner(user);
      return cloudLifecycleService.reset();
    },
    { auth: true },
  );
