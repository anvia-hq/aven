import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { diffQuery } from "./schema";
import { createDiffService } from "./service";

// What a thread has changed in its workspace (decision 0030): since its latest run began, or since
// its branch left the default branch.
export const diffRouter = (hub: RuntimeHub) => {
  const service = createDiffService(hub);
  return new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get(
      "/:id/diff",
      ({ params, query, organizationId }) => service.get(organizationId, params.id, query.scope),
      {
        thread: "read",
        params: threadParams,
        query: diffQuery,
      },
    );
};
