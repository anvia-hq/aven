import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { createArtifactsService } from "../artifacts/service";
import { createComputerService } from "../computer/service";
import type { RuntimeHub } from "../runtimes/hub";
import { botRunnerFor } from "./computer";
import { botArtifactParams, botParams } from "./schema";

export const botComputerRouter = (hub: RuntimeHub, runtimeId: string) => {
  const runner = botRunnerFor(hub, runtimeId);
  const computer = createComputerService(runner);
  const artifacts = createArtifactsService(runner);

  return new Elysia({ prefix: "/bots" })
    .use(authRouter)
    .get(
      "/:id/artifacts/:name",
      ({ params, user, request }) =>
        artifacts.read(user.id, params.id, params.name, request.headers.get("range")),
      {
        auth: true,
        params: botArtifactParams,
      },
    )
    .get("/:id/computer", ({ params, user }) => computer.status(user.id, params.id), {
      auth: true,
      params: botParams,
    })
    .post("/:id/computer/wake", ({ params, user }) => computer.wake(user.id, params.id), {
      auth: true,
      params: botParams,
    });
};
