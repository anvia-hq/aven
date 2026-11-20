import { artifactType, documentType } from "./artifact-type";
import { saveCheckedFile } from "./internal/save-file";
import { errorMessage } from "./values";
import type { BotFiles, SentFile } from "./types";
import type { ToolArtifact } from "@aven/protocol/types";

async function keepFile(
  files: BotFiles,
  { path, title }: SentFile,
  abortSignal?: AbortSignal,
): Promise<ToolArtifact> {
  const { name, mediaType, size } = await saveCheckedFile(files, {
    path,
    abortSignal,
    sniff: (bytes, filePath) => artifactType(bytes) ?? documentType(bytes, filePath),
    unsupportedError: (filePath) =>
      `${filePath} is not an image, video, HTML page, PDF, or a markdown, CSV or text file`,
    tooLargeError: (filePath, fileSize, type, limit) =>
      `${filePath} is ${fileSize} bytes; ${type} up to ${limit} can be sent`,
  });
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  return { name, mediaType, title: title ?? fileName, size };
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
