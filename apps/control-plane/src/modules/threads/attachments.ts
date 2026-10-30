import { imageType } from "@aven/agents/tools/show-image";
import { ATTACHMENT_LIMITS } from "@aven/protocol/events";
import { ARTIFACT_EXTENSIONS, type RunAttachment } from "@aven/protocol/runtime-wire";

import { UnprocessableError } from "../../errors";
import type { AttachmentBody } from "./schema";

const MB = 1024 * 1024;

// The files sent with a message, checked and named for the runner (decision 0034). A file whose
// bytes are a PNG, JPEG, GIF or WebP image is shown to the model as well, so it gets the name the
// runner keeps its copy under; anything else, an SVG included, only goes to the sandbox.
export function prepareAttachments(files: readonly AttachmentBody[]): RunAttachment[] {
  let total = 0;
  return files.map(({ name, mediaType, data }) => {
    const bytes = Uint8Array.fromBase64(data);
    total += bytes.length;
    if (total > ATTACHMENT_LIMITS.totalBytes) {
      throw new UnprocessableError(
        `The files of one message can add up to ${ATTACHMENT_LIMITS.totalBytes / MB} MB`,
      );
    }
    const image = imageType(bytes);
    if (!image) {
      return { name, mediaType: mediaType ?? "application/octet-stream", size: bytes.length, data };
    }
    if (bytes.length > ATTACHMENT_LIMITS.imageBytes) {
      throw new UnprocessableError(
        `${name} is larger than ${ATTACHMENT_LIMITS.imageBytes / MB} MB, the most a model takes for an image`,
      );
    }
    const kept = `${crypto.randomUUID()}.${ARTIFACT_EXTENSIONS[image]}`;
    return { name, mediaType: image, size: bytes.length, image: kept, data };
  });
}
