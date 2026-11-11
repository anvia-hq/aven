import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { runnerFor } from "../runtimes/ask-runner";
import { createComputerService } from "./service";

export const computerRouter = (hub: RuntimeHub) => {
  const service = createComputerService(runnerFor(hub));
  return new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get(
      "/:id/computer",
      ({ params, organizationId }) => service.status(organizationId, params.id),
      {
        thread: "own",
        params: threadParams,
      },
    )
    .post(
      "/:id/computer/wake",
      ({ params, organizationId }) => service.wake(organizationId, params.id),
      { thread: "own", params: threadParams },
    );
};
