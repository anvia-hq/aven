import { Elysia } from "elysia";

import { threadAccess } from "../threads/access";
import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { artifactParams } from "./schema";
import { createArtifactsService } from "./service";

// The images a thread's agent showed with `show_image` (decision 0033), as image bytes.
export const artifactsRouter = (hub: RuntimeHub) => {
  const service = createArtifactsService(runnerFor(hub));
  return new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get(
      "/:id/artifacts/:name",
      ({ params, organizationId }) => service.read(organizationId, params.id, params.name),
      { thread: "read", params: artifactParams },
    );
};
