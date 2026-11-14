import type { ArtifactContent } from "@aven/protocol/types";

import { HTML_HEADERS, framedHtml } from "./html-frame";
import { byteRange } from "./range";

const IMAGE_HEADERS = {
  "cache-control": "private, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
};

const PDF_HEADERS = {
  "cache-control": "private, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'",
};

const policyOf = (mediaType: string) =>
  mediaType === "application/pdf" ? PDF_HEADERS : IMAGE_HEADERS;

const TEXT_MEDIA_TYPES = new Set(["text/markdown", "text/csv", "text/plain"]);

export function artifactResponse(image: ArtifactContent, range?: string | null) {
  const bytes = Buffer.from(image.data, "base64");

  if (image.mediaType === "text/html") {
    return new Response(framedHtml(bytes.toString("utf8")), { headers: HTML_HEADERS });
  }

  const headers = {
    "content-type": TEXT_MEDIA_TYPES.has(image.mediaType)
      ? "text/plain; charset=utf-8"
      : image.mediaType,
    "accept-ranges": "bytes",
    ...policyOf(image.mediaType),
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
}
