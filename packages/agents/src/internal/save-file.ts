import { MAX_DOCUMENT_BYTES } from "@aven/protocol/runtime-wire";

import type { BotFiles } from "../types";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
export const MAX_HTML_BYTES = 2 * 1024 * 1024;

export function mediaByteLimit(mediaType: string) {
  if (mediaType === "text/html") return MAX_HTML_BYTES;

  if (mediaType.startsWith("video/")) return MAX_VIDEO_BYTES;

  if (mediaType.startsWith("image/")) return MAX_IMAGE_BYTES;

  return MAX_DOCUMENT_BYTES;
}

export async function saveCheckedFile(
  files: BotFiles,
  options: {
    path: string;
    abortSignal?: AbortSignal | undefined;
    sniff(bytes: Uint8Array, path: string): string | null;
    unsupportedError(path: string): string;
    tooLargeError(path: string, size: number, mediaType: string, limit: number): string;
  },
) {
  const { path, abortSignal } = options;
  const bytes = await files.readFile({ path, abortSignal });
  const mediaType = options.sniff(bytes, path);

  if (!mediaType) throw new Error(options.unsupportedError(path));

  const limit = mediaByteLimit(mediaType);

  if (bytes.length > limit) {
    throw new Error(options.tooLargeError(path, bytes.length, mediaType, limit));
  }

  const name = await files.save(bytes, mediaType);
  return { name, mediaType, size: bytes.length };
}
