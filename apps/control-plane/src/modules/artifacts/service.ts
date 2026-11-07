import { NotFoundError } from "../../errors";
import type { Runner } from "../runtimes/ask-runner";
import { byteRange } from "./range";
import { artifactAnswer } from "./schema";

// An artifact is named by a fresh uuid and never changes, so a browser may keep it for good.
const IMAGE_HEADERS = {
  "cache-control": "private, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
};

// The images and videos a thread's agent showed, the images a person sent, and those sent to a bot (decisions 0033 and
// 0080), read through the runner that keeps them. Every call starts from a computer of the
// caller's: `scope` is their organization for a thread and themselves for a bot.
export function createArtifactsService(runner: Runner) {
  return {
    async read(scope: string, threadId: string, name: string, range?: string | null) {
      const image = await runner.ask(scope, "artifacts.read", { threadId, name }, artifactAnswer, {
        logged: "The artifacts.read call was refused:",
        message: "The image could not be read",
      });
      if (!image) throw new NotFoundError("No such image");
      const bytes = Buffer.from(image.data, "base64");
      const headers = {
        "content-type": image.mediaType,
        "accept-ranges": "bytes",
        ...IMAGE_HEADERS,
      };
      // A video is asked for in pieces (decision 0136); the whole file is here, so a piece is a slice.
      const wanted = byteRange(range, bytes.length);
      if (wanted === "unsatisfiable") {
        return new Response(null, {
          status: 416,
          headers: { ...headers, "content-range": `bytes */${bytes.length}` },
        });
      }
      if (!wanted) return new Response(bytes, { headers });
      return new Response(bytes.subarray(wanted.start, wanted.end + 1), {
        status: 206,
        headers: {
          ...headers,
          "content-range": `bytes ${wanted.start}-${wanted.end}/${bytes.length}`,
        },
      });
    },
  };
}
