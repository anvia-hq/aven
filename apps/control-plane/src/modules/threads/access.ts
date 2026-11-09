import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { threadsService } from "./service";

export const threadAccess = new Elysia({ name: "thread-access" }).use(authRouter).macro({
  thread: (access: "read" | "own" | "drive") => ({
    auth: true,
    org: true,
    async beforeHandle(context) {
      const { params, organizationId, user } = context as typeof context & {
        params: { id: string };
        organizationId: string;
        user: { id: string };
      };
      const { id } = params;
      const viewer = { organizationId, userId: user.id };
      if (access === "own") await threadsService.owned(viewer, id);
      else if (access === "drive") await threadsService.drivable(viewer, id);
      else await threadsService.readable(viewer, id);
    },
  }),
});
