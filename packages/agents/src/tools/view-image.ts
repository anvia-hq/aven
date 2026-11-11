import { createTool } from "@anvia/core";
import { ToolOutput } from "@anvia/core/tool";
import { VIEW_IMAGE_TOOL_NAME } from "@aven/protocol/events";
import { z } from "zod";

import { imageType } from "../image-type";
import type { ImageFiles } from "./types";

export const MAX_VIEW_IMAGE_BYTES = 5 * 1024 * 1024;

export function createViewImageTool(files: ImageFiles) {
  return createTool({
    name: VIEW_IMAGE_TOOL_NAME,
    description: `Look at an image file on this machine: a PNG, JPEG, GIF or WebP of up to 5 MiB, such as a screenshot you took, a chart you plotted, a design mockup or a photo the user uploaded. read_file cannot open images; this returns the picture itself so you can see it. It only lets you see the image; to put it in front of the user, call show_artifact.`,
    inputSchema: z.object({
      path: z.string().min(1).describe("The image file, relative to the workspace or absolute."),
    }),
    async execute({ path }, context) {
      const bytes = await files.readFile({ path, abortSignal: context?.abortSignal });
      const mediaType = imageType(bytes);
      if (!mediaType) throw new Error(`${path} is not a PNG, JPEG, GIF or WebP image`);
      if (bytes.length > MAX_VIEW_IMAGE_BYTES) {
        throw new Error(
          `${path} is ${bytes.length} bytes; images up to ${MAX_VIEW_IMAGE_BYTES / 1024 / 1024} MiB can be viewed`,
        );
      }
      return ToolOutput.content([
        { type: "text", text: `${path} (${mediaType}, ${bytes.length} bytes)` },
        {
          type: "file",
          data: { type: "data", data: Buffer.from(bytes).toString("base64") },
          mediaType,
          filename: path.split("/").pop() || "image",
        },
      ]);
    },
  });
}
