import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { processParams } from "./schema";
import { createProcessesService } from "./service";

export const processesRouter = (hub: RuntimeHub) => {
  const service = createProcessesService(hub);
  const options = { thread: "own" } as const;
  return new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get(
      "/:id/processes",
      ({ params, organizationId }) => service.list(organizationId, params.id),
      {
        ...options,
        params: threadParams,
      },
    )
    .post(
      "/:id/processes/:processId/stop",
      ({ params, organizationId }) => service.stop(organizationId, params.id, params.processId),
      { ...options, params: processParams },
    )
    .get(
      "/:id/processes/:processId/logs",
      ({ params, organizationId }) => service.logs(organizationId, params.id, params.processId),
      { ...options, params: processParams },
    );
};
