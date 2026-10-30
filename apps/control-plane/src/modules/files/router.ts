import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { filesQuery } from "./schema";
import { createFilesService } from "./service";

// The files of a thread's workspace, for reading (decision 0031). Nothing is written.
export const filesRouter = (hub: RuntimeHub) => {
  const service = createFilesService(hub);
  const options = { auth: true, org: true, params: threadParams, query: filesQuery } as const;
  return new Elysia({ prefix: "/threads" })
    .use(authRouter)
    .get(
      "/:id/files",
      ({ params, query, organizationId }) => service.list(organizationId, params.id, query.path),
      options,
    )
    .get(
      "/:id/files/content",
      ({ params, query, organizationId }) => service.read(organizationId, params.id, query.path),
      options,
    );
};
