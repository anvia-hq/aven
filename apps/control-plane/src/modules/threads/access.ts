import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { threadsService } from "./service";

// A thread is its creator's: nobody else sees it unless it is shared with the workspace, and then
// only to read (decision 0084). Mount this instead of `authRouter` on a route with a thread's `:id`
// and say what the route does with it: `{ thread: "read" }` for a route that only looks, which the
// creator and, once it is shared, every member may call, and `{ thread: "own" }` for one that acts
// on the thread or its sandbox, which only the creator may. Anyone else is told it is not found.
export const threadAccess = new Elysia({ name: "thread-access" }).use(authRouter).macro({
  thread: (access: "read" | "own") => ({
    auth: true,
    org: true,
    async beforeHandle(context) {
      // `auth` and `org` ran first, but a macro's own hook is not typed with what they added.
      const { params, organizationId, user } = context as typeof context & {
        params: { id: string };
        organizationId: string;
        user: { id: string };
      };
      const { id } = params;
      const viewer = { organizationId, userId: user.id };
      if (access === "own") await threadsService.owned(viewer, id);
      else await threadsService.readable(viewer, id);
    },
  }),
});
