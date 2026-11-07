import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { diffQuery } from "./schema";
import { createDiffService } from "./service";

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
