import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import { threadParams } from "../threads/schema";
import { browserBody } from "./schema";
import type { createBrowserService } from "./service";

export const browserRouter = (service: ReturnType<typeof createBrowserService>) =>
  new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .post(
      "/:id/browser",
      ({ params, body, organizationId, user }) =>
        service.open(organizationId, user.id, params.id, body.port),
      { thread: "read", params: threadParams, body: browserBody },
    );
