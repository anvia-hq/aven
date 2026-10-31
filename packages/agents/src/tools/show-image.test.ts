import { describe, expect, test } from "bun:test";

import { projectToolOutput } from "../tool-projection";
import { createShowImageTool, MAX_IMAGE_BYTES } from "./show-image";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

// A sandbox with these files, and the images the tool kept, in the order it kept them.
function setup(files: Record<string, Uint8Array>) {
  const kept: { bytes: Uint8Array; mediaType: string }[] = [];
  const tool = createShowImageTool({
    readFile: async ({ path }) => {
      const bytes = files[path];
      if (!bytes) throw new Error(`File not found: ${path}`);
      return bytes;
    },
    save: async (bytes, mediaType) => {
      kept.push({ bytes, mediaType });
      return `00000000-0000-4000-8000-00000000000${kept.length}.png`;
    },
  });
  return { tool, kept };
}

describe("show_image", () => {
  test("keeps an image and says what it is called", async () => {
    const { tool, kept } = setup({ "plot.png": PNG });
    const result = await tool.call({ path: "plot.png", caption: "Sales" });
    expect(result).toEqual({
      image: {
        name: "00000000-0000-4000-8000-000000000001.png",
        mediaType: "image/png",
        caption: "Sales",
      },
      path: "plot.png",
    });
    expect(kept).toEqual([{ bytes: PNG, mediaType: "image/png" }]);
  });

  test("goes by what a file holds, not its name", async () => {
    const svg = new TextEncoder().encode("<svg onload='alert(1)'/>");
    const { tool, kept } = setup({ "plot.png": svg });
    await expect(tool.call({ path: "plot.png" })).rejects.toThrow("is not a PNG");
    expect(kept).toEqual([]);
  });

  test("refuses an image too large to show", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    const { tool } = setup({ "big.png": big });
    await expect(tool.call({ path: "big.png" })).rejects.toThrow("up to 8 MiB");
  });

  test("its result becomes the image a client shows", () => {
    const image = { name: "00000000-0000-4000-8000-000000000001.png", mediaType: "image/png" };
    const output = { type: "json" as const, value: { image, path: "/tmp/plot.png" } };
    expect(projectToolOutput(output, "show_image")).toEqual({
      status: "done",
      output: "Showed /tmp/plot.png",
      image,
    });
    // Another tool's result is only text, whatever it holds.
    expect(projectToolOutput(output, "web_search").image).toBeUndefined();
  });
});
