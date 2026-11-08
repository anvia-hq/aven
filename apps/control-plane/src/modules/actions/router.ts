import { Elysia, status } from "elysia";

import { threadAccess } from "../threads/access";
import { actionBody, threadParams } from "./schema";
import type { createActionsService } from "./service";

export const actionsRouter = (service: ReturnType<typeof createActionsService>) =>
  new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get("/:id/actions", ({ params, organizationId }) => service.list(organizationId, params.id), {
      thread: "own",
      params: threadParams,
    })
    .post(
      "/:id/actions",
      async ({ params, body, organizationId, user }) =>
        status(202, await service.start(organizationId, user.id, params.id, body)),
      { thread: "own", params: threadParams, body: actionBody },
    );
