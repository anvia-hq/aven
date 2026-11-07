import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { artifactParams } from "./schema";
import { createArtifactsService } from "./service";

// The images and videos a thread's agent showed with `show_artifact` (decisions 0033 and 0136), as bytes.
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
