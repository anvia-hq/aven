import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import { threadParams } from "../threads/schema";
import type { createFollowUps } from "./service";

export const followUpsRouter = (followUps: ReturnType<typeof createFollowUps>) =>
  new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .post(
      "/:id/follow-ups",
      ({ params, user, organizationId }) =>
        followUps.forThread({ organizationId, userId: user.id }, params.id),
      { thread: "drive", params: threadParams },
    );
