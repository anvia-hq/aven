import { imageType } from "@aven/agents/image-type";
import { ATTACHMENT_LIMITS } from "@aven/protocol/events";
import { ARTIFACT_EXTENSIONS } from "@aven/protocol/runtime-wire";

import { z } from "zod";

import { UnprocessableError } from "./errors";
import type { MessageAttachment, RunAttachment } from "@aven/protocol/types";

const MB = 1024 * 1024;

export const attachmentBody = z.object({
  name: z.string().trim().min(1).max(255),
  mediaType: z
    .string()
    .regex(/^[\w.+-]+\/[\w.+-]+$/)
    .max(100)
    .optional(),
  data: z.base64(),
});

export type AttachmentBody = z.infer<typeof attachmentBody>;

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

export function withoutBytes({ name, mediaType, size, image }: RunAttachment): MessageAttachment {
  return image ? { name, mediaType, size, image } : { name, mediaType, size };
}
