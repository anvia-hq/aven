import { NotFoundError } from "../../errors";
import { HTML_HEADERS, framedHtml } from "./html-frame";
import { byteRange } from "./range";
import { artifactAnswer } from "./schema";
import type { Runner } from "../runtimes/types";

const IMAGE_HEADERS = {
  "cache-control": "private, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
};

export function createArtifactsService(runner: Runner) {
  return {
    async read(scope: string, threadId: string, name: string, range?: string | null) {
      const image = await runner.ask(scope, "artifacts.read", { threadId, name }, artifactAnswer, {
        logged: "The artifacts.read call was refused:",
        message: "The image could not be read",
      });

      if (!image) throw new NotFoundError("No such image");

      const bytes = Buffer.from(image.data, "base64");

      if (image.mediaType === "text/html") {
        return new Response(framedHtml(bytes.toString("utf8")), { headers: HTML_HEADERS });
      }

      const headers = {
        "content-type": image.mediaType,
        "accept-ranges": "bytes",
        ...IMAGE_HEADERS,
      };
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
