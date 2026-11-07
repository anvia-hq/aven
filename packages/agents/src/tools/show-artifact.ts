import { createTool } from "@anvia/core";
import {
  MAX_ARTIFACTS_PER_CALL,
  SHOW_ARTIFACT_TOOL_NAME,
  type ToolArtifact,
} from "@aven/protocol/events";
import { z } from "zod";

import { artifactType } from "../artifact-type";
import { errorMessage } from "../values";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

type ArtifactFiles = {
  readFile(options: { path: string; abortSignal?: AbortSignal }): Promise<Uint8Array>;
  save(bytes: Uint8Array, mediaType: string): Promise<string>;
};

const itemSchema = z.object({
  path: z.string().min(1).describe("The file, relative to the workspace or absolute."),
  caption: z.string().max(500).optional().describe("A short line shown under it."),
});

export type ShownArtifacts = {
  artifacts: ToolArtifact[];
  paths: string[];
  failed: { path: string; error: string }[];
};

export function createShowArtifactTool(files: ArtifactFiles) {
  const show = async (
    { path, caption }: z.infer<typeof itemSchema>,
    abortSignal?: AbortSignal,
  ): Promise<ToolArtifact> => {
    const bytes = await files.readFile({ path, abortSignal });
    const mediaType = artifactType(bytes);
    if (!mediaType) throw new Error(`${path} is not a PNG, JPEG, GIF, WebP, MP4 or WebM file`);
    const video = mediaType.startsWith("video/");
    const limit = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (bytes.length > limit) {
      throw new Error(
        `${path} is ${bytes.length} bytes; ${video ? "videos" : "images"} up to ${limit / 1024 / 1024} MiB can be shown`,
      );
    }
    const name = await files.save(bytes, mediaType);
    return caption ? { name, mediaType, caption } : { name, mediaType };
  };

  return createTool({
    name: SHOW_ARTIFACT_TOOL_NAME,
    description: `Show the user files from the sandbox in the conversation: images (PNG, JPEG, GIF or WebP, up to 8 MiB each) and videos (MP4 or WebM, up to 10 MiB each), such as a chart you plotted, a screenshot or a short screen recording. Give every file you want shown in one call, up to ${MAX_ARTIFACTS_PER_CALL}: several appear together as a grid. Save the files first; SVG is not supported, so save plots as PNG.`,
    inputSchema: z.object({
      items: z
        .array(itemSchema)
        .min(1)
        .max(MAX_ARTIFACTS_PER_CALL)
        .describe("The files to show, in the order to show them."),
    }),
    async execute({ items }, context) {
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
