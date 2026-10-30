import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { createShipService } from "./service";

// Ships a thread as a pull request (decision 0040).
export const shipRouter = (hub: RuntimeHub, service = createShipService(hub)) =>
  new Elysia({ prefix: "/threads" })
    .use(authRouter)
    .post(
      "/:id/ship",
      ({ params, organizationId, user }) =>
        service.ship(organizationId, { name: user.name, email: user.email }, params.id),
      { auth: true, org: true, params: threadParams },
    );
