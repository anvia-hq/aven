import { Elysia, status } from "elysia";

import { threadAccess } from "../threads/access";
import { shipBody, threadParams } from "../threads/schema";
import type { createShipService } from "./service";

export const shipRouter = (service: ReturnType<typeof createShipService>) =>
  new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get(
      "/:id/ship",
      ({ params, organizationId }) => service.readiness(organizationId, params.id),
      {
        thread: "own",
        params: threadParams,
      },
    )
    .post(
      "/:id/ship",
      async ({ params, body, organizationId, user }) => {
        await service.ship(organizationId, user.id, params.id, body);
        return status(202, { ok: true });
      },
      { thread: "own", params: threadParams, body: shipBody },
    );
