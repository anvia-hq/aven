import { imageType } from "@aven/agents/image-type";
import { ATTACHMENT_LIMITS, type MessageAttachment } from "@aven/protocol/events";
import { ARTIFACT_EXTENSIONS, type RunAttachment } from "@aven/protocol/runtime-wire";

import { z } from "zod";

import { UnprocessableError } from "./errors";

const MB = 1024 * 1024;

// A file sent with a message, its bytes in base64; sizes are checked once decoded (decision 0034).
export const attachmentBody = z.object({
  name: z.string().trim().min(1).max(255),
  // What the browser says the file is; an image's type is read from its bytes instead.
  mediaType: z
    .string()
    .regex(/^[\w.+-]+\/[\w.+-]+$/)
    .max(100)
    .optional(),
  data: z.base64(),
});

export type AttachmentBody = z.infer<typeof attachmentBody>;

// The files sent with a message to a thread or a bot, checked and named for the runner (decisions
// 0034 and 0080). A file whose bytes are a PNG, JPEG, GIF or WebP image is shown to the model as
// well, so it gets the name the runner keeps its copy under; anything else, an SVG included, only
// goes to the sandbox.
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

/** What a message's file is to a client: its name, type and size, and its image's name, without the bytes. */
export function withoutBytes({ name, mediaType, size, image }: RunAttachment): MessageAttachment {
  return image ? { name, mediaType, size, image } : { name, mediaType, size };
}
