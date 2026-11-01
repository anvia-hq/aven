import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { processParams } from "./schema";
import { createProcessesService } from "./service";

// The processes the agent left running in a thread's sandbox: to see, to read the output of and
// to stop, without an agent turn (decision 0071).
export const processesRouter = (hub: RuntimeHub) => {
  const service = createProcessesService(hub);
  const options = { auth: true, org: true } as const;
  return new Elysia({ prefix: "/threads" })
    .use(authRouter)
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
