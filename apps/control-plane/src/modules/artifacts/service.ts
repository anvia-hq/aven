import { NotFoundError } from "@aven/server-kit/errors";

import type { Runner } from "../runtimes/types";
import { artifactResponse } from "./response";
import { artifactAnswer } from "./schema";

export function createArtifactsService(runner: Runner) {
  return {
    async read(scope: string, threadId: string, name: string, range?: string | null) {
      const image = await runner.ask(scope, "artifacts.read", { threadId, name }, artifactAnswer, {
        logged: "The artifacts.read call was refused:",
        message: "The image could not be read",
      });

      if (!image) throw new NotFoundError("No such image");

      return artifactResponse(image, range);
    },
  };
}
