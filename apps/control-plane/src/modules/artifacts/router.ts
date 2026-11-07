import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { artifactParams } from "./schema";
import { createArtifactsService } from "./service";

export const artifactsRouter = (hub: RuntimeHub) => {
  const service = createArtifactsService(runnerFor(hub));
  return new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get(
      "/:id/artifacts/:name",
      ({ params, organizationId, request }) =>
        service.read(organizationId, params.id, params.name, request.headers.get("range")),
      { thread: "read", params: artifactParams },
    );
};
