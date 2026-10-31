import { createTool } from "@anvia/core";
import { SHOW_IMAGE_TOOL_NAME, type ToolImage } from "@aven/protocol/events";
import { z } from "zod";

import { imageType } from "../image-type";

/** Larger images are refused; a chart or a screenshot is far smaller. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Where the image tool reads from and where it keeps what it shows; any `SandboxRuntime` reads. */
type ImageFiles = {
  readFile(options: { path: string; abortSignal?: AbortSignal }): Promise<Uint8Array>;
  /** Keeps a copy of the image and returns the name it is served by. */
  save(bytes: Uint8Array, mediaType: string): Promise<string>;
};

// Shows the user an image the agent made in its sandbox, such as a chart (decision 0033). A copy is
// kept, so the image stays as it was when shown even if the file changes or goes.
export function createShowImageTool(files: ImageFiles) {
  return createTool({
    name: SHOW_IMAGE_TOOL_NAME,
    description:
      "Show the user an image file from the sandbox (PNG, JPEG, GIF or WebP, up to 8 MiB), such as a chart you plotted or a screenshot you saved. It appears in the conversation. Save the file first; SVG is not supported, so save plots as PNG.",
    inputSchema: z.object({
      path: z.string().min(1).describe("The image file, relative to the workspace or absolute."),
      caption: z.string().max(500).optional().describe("A short line shown under the image."),
    }),
    async execute({ path, caption }, context) {
      const bytes = await files.readFile({ path, abortSignal: context?.abortSignal });
      if (bytes.length > MAX_IMAGE_BYTES) {
        throw new Error(`${path} is ${bytes.length} bytes; images up to 8 MiB can be shown`);
      }
      const mediaType = imageType(bytes);
      if (!mediaType) throw new Error(`${path} is not a PNG, JPEG, GIF or WebP image`);
      const name = await files.save(bytes, mediaType);
      const image: ToolImage = caption ? { name, mediaType, caption } : { name, mediaType };
      return { image, path };
    },
  });
}
