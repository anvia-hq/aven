import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { shipBody, threadParams } from "../threads/schema";
import type { createShipService } from "./service";

// Ships a thread by sending its agent the ship prompt (decision 0044). Like a message, it answers
// 202: the work goes on in the thread, which the client follows.
export const shipRouter = (service: ReturnType<typeof createShipService>) =>
  new Elysia({ prefix: "/threads" })
    .use(authRouter)
    // Whether the repository is set up to ship: its environment and its way of shipping (decision 0083).
    .get(
      "/:id/ship",
      ({ params, organizationId }) => service.readiness(organizationId, params.id),
      {
        auth: true,
        org: true,
        params: threadParams,
      },
    )
    .post(
      "/:id/ship",
      async ({ params, body, organizationId, user }) => {
        await service.ship(organizationId, user.id, params.id, body);
        return status(202, { ok: true });
      },
      { auth: true, org: true, params: threadParams, body: shipBody },
    );
