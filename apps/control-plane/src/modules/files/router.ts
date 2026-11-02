import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { filesQuery, searchQuery } from "./schema";
import { createFilesService } from "./service";

// The files of a thread's workspace, for reading (decision 0031) and for the composer's `@` to
// find (decision 0036). Nothing is written.
export const filesRouter = (hub: RuntimeHub) => {
  const service = createFilesService(hub);
  const options = { thread: "read", params: threadParams, query: filesQuery } as const;
  const search = { thread: "read", params: threadParams, query: searchQuery } as const;
  return new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get(
      "/:id/files",
      ({ params, query, organizationId }) => service.list(organizationId, params.id, query.path),
      options,
    )
    .get(
      "/:id/files/content",
      ({ params, query, organizationId }) => service.read(organizationId, params.id, query.path),
      options,
    )
    .get(
      "/:id/files/search",
      ({ params, query, organizationId }) => service.search(organizationId, params.id, query.q),
      search,
    );
};
