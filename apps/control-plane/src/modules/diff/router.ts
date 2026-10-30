import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import { diffParams, diffQuery } from "./schema";
import { createDiffService } from "./service";

// What a thread has changed in its workspace (decision 0030): since its latest run began, or since
// its branch left the default branch.
export const diffRouter = (hub: RuntimeHub) => {
  const service = createDiffService(hub);
  return new Elysia({ prefix: "/threads" })
    .use(authRouter)
    .get(
      "/:id/diff",
      ({ params, query, organizationId }) => service.get(organizationId, params.id, query.scope),
      {
        auth: true,
        org: true,
        params: diffParams,
        query: diffQuery,
      },
    );
};
