import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { createShipService } from "./service";

// Ships a thread by sending its agent the ship prompt (decision 0044). Like a message, it answers
// 202: the work goes on in the thread, which the client follows.
export const shipRouter = (hub: RuntimeHub, service = createShipService(hub)) =>
  new Elysia({ prefix: "/threads" }).use(authRouter).post(
    "/:id/ship",
    async ({ params, organizationId, user }) => {
      await service.ship(organizationId, user.id, params.id);
      return status(202, { ok: true });
    },
    { auth: true, org: true, params: threadParams },
  );
