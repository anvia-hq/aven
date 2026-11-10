import { Elysia, status } from "elysia";

import { threadAccess } from "../threads/access";
import { threadParams } from "./schema";
import type { createEnvironmentService } from "./service";

export const environmentRouter = (service: ReturnType<typeof createEnvironmentService>) =>
  new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get("/:id/environment", ({ params }) => service.state(params.id), {
      thread: "own",
      params: threadParams,
    })
    .post(
      "/:id/environment/snapshot",
      async ({ params, organizationId }) =>
        status(202, await service.snapshot(organizationId, params.id)),
      { thread: "own", params: threadParams },
    );
