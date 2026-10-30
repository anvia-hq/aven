import { describeError, NotFoundError, UnavailableError } from "../../errors";
import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { artifactAnswer } from "./schema";

// An image is named by a fresh uuid and never changes, so a browser may keep it for good.
const IMAGE_HEADERS = {
  "cache-control": "private, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
};

// The images a thread's agent showed, read through the runner that keeps them (decision 0033).
// Every call starts from a thread of the caller's organization.
export function createArtifactsService(hub: RuntimeHub) {
  const runner = runnerFor(hub);

  return {
    async read(organizationId: string, threadId: string, name: string) {
      // The runtime's own reason stays in the log; the client gets a fixed message.
      const image = await runner.ask(
        organizationId,
        "artifacts.read",
        { threadId, name },
        artifactAnswer,
        (error) => {
          console.warn("The artifacts.read call was refused:", describeError(error));
          throw new UnavailableError("The image could not be read");
        },
      );
      if (!image) throw new NotFoundError("No such image");
      return new Response(Buffer.from(image.data, "base64"), {
        headers: { "content-type": image.mediaType, ...IMAGE_HEADERS },
      });
    },
  };
}
