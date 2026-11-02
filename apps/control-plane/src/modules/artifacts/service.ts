import { NotFoundError } from "../../errors";
import type { Runner } from "../runtimes/ask-runner";
import { artifactAnswer } from "./schema";

// An image is named by a fresh uuid and never changes, so a browser may keep it for good.
const IMAGE_HEADERS = {
  "cache-control": "private, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
};

// The images a thread's agent showed or a person sent, and those sent to a bot (decisions 0033 and
// 0080), read through the runner that keeps them. Every call starts from a computer of the
// caller's: `scope` is their organization for a thread and themselves for a bot.
export function createArtifactsService(runner: Runner) {
  return {
    async read(scope: string, threadId: string, name: string) {
      const image = await runner.ask(scope, "artifacts.read", { threadId, name }, artifactAnswer, {
        logged: "The artifacts.read call was refused:",
        message: "The image could not be read",
      });
      if (!image) throw new NotFoundError("No such image");
      return new Response(Buffer.from(image.data, "base64"), {
        headers: { "content-type": image.mediaType, ...IMAGE_HEADERS },
      });
    },
  };
}
