import { createTool } from "@anvia/core";
import { MAX_ARTIFACTS_PER_CALL, SHOW_ARTIFACT_TOOL_NAME } from "@aven/protocol/events";
import { z } from "zod";

import { artifactType } from "../artifact-type";
import {
  MAX_HTML_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  saveCheckedFile,
} from "../internal/save-file";
import { errorMessage } from "../values";
import type { BotFiles } from "../types";
import type { ShownArtifacts } from "./types";
import type { ToolArtifact } from "@aven/protocol/types";

export { MAX_HTML_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES };

function kindOf(mediaType: string) {
  if (mediaType === "text/html") return "pages";

  return mediaType.startsWith("video/") ? "videos" : "images";
}

const itemSchema = z.object({
  path: z.string().min(1).describe("The file, relative to the workspace or absolute."),
  caption: z.string().max(500).optional().describe("A short line shown under it."),
});

export function createShowArtifactTool(files: BotFiles) {
  const show = async (
    { path, caption }: z.infer<typeof itemSchema>,
    abortSignal?: AbortSignal,
  ): Promise<ToolArtifact> => {
    const { name, mediaType } = await saveCheckedFile(files, {
      path,
      abortSignal,
      sniff: (bytes) => artifactType(bytes),
      unsupportedError: (filePath) =>
        `${filePath} is not a PNG, JPEG, GIF, WebP, MP4, WebM or HTML file`,
      tooLargeError: (filePath, size, type, limit) =>
        `${filePath} is ${size} bytes; ${kindOf(type)} up to ${limit / 1024 / 1024} MiB can be shown`,
    });
    return caption ? { name, mediaType, caption } : { name, mediaType };
  };

  return createTool({
    name: SHOW_ARTIFACT_TOOL_NAME,
    description: `Show the user files from this machine in the conversation: images (PNG, JPEG, GIF or WebP, up to 8 MiB each) and videos (MP4 or WebM, up to 10 MiB each), such as a chart you plotted, a screenshot or a short screen recording, and interactive HTML pages (up to 2 MiB each, one self-contained file: every script and style inline, no network). A page runs in a sandboxed frame with no access to the app, the network or storage, and is drawn in the conversation as a live component. Give every file you want shown in one call, up to ${MAX_ARTIFACTS_PER_CALL}: several appear together as a grid. Save the files first; SVG is not supported, so save plots as PNG.`,
    inputSchema: z.object({
      items: z
        .array(itemSchema)
        .min(1)
        .max(MAX_ARTIFACTS_PER_CALL)
        .describe("The files to show, in the order to show them."),
    }),
    async handler({ items }, context) {
      const shown: ShownArtifacts = { artifacts: [], paths: [], failed: [] };
      for (const item of items) {
        try {
          shown.artifacts.push(await show(item, context?.abortSignal));
          shown.paths.push(item.path);
        } catch (error) {
          context?.abortSignal?.throwIfAborted();
          shown.failed.push({ path: item.path, error: errorMessage(error) });
        }
      }

      if (shown.artifacts.length === 0) throw new Error(shown.failed[0]!.error);

      return shown;
    },
  });
}
