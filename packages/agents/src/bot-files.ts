import { MAX_DOCUMENT_BYTES } from "@aven/protocol/runtime-wire";

import { artifactType, documentType } from "./artifact-type";
import { MAX_HTML_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "./tools/show-artifact";
import { errorMessage } from "./values";
import type { BotFiles, SentFile } from "./types";
import type { ToolArtifact } from "@aven/protocol/types";

function limitOf(mediaType: string) {
  if (mediaType === "text/html") return MAX_HTML_BYTES;

  if (mediaType.startsWith("video/")) return MAX_VIDEO_BYTES;

  if (mediaType.startsWith("image/")) return MAX_IMAGE_BYTES;

  return MAX_DOCUMENT_BYTES;
}

async function keepFile(
  files: BotFiles,
  { path, title }: SentFile,
  abortSignal?: AbortSignal,
): Promise<ToolArtifact> {
  const bytes = await files.readFile({ path, abortSignal });
  const mediaType = artifactType(bytes) ?? documentType(bytes, path);

  if (!mediaType) {
    throw new Error(
      `${path} is not an image, video, HTML page, PDF, or a markdown, CSV or text file`,
    );
  }

  const limit = limitOf(mediaType);

  if (bytes.length > limit) {
    throw new Error(`${path} is ${bytes.length} bytes; ${mediaType} up to ${limit} can be sent`);
  }

  const name = await files.save(bytes, mediaType);
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  return { name, mediaType, title: title ?? fileName, size: bytes.length };
}

export async function keepFiles(
  files: BotFiles,
  sent: readonly SentFile[],
  abortSignal?: AbortSignal,
) {
  const kept: ToolArtifact[] = [];
  const failed: { path: string; error: string }[] = [];

  for (const file of sent) {
    try {
      kept.push(await keepFile(files, file, abortSignal));
    } catch (error) {
      abortSignal?.throwIfAborted();
      failed.push({ path: file.path, error: errorMessage(error) });
    }
  }

  return { kept, failed };
}
