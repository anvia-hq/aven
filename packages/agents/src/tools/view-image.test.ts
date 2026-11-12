import { describe, expect, test } from "bun:test";

import { projectToolOutput } from "../tool-projection";
import { MAX_VIEW_IMAGE_BYTES, createViewImageTool } from "./view-image";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function setup(files: Record<string, Uint8Array>) {
  return createViewImageTool({
    readFile: async ({ path }) => {
      const bytes = files[path];

      if (!bytes) throw new Error(`File not found: ${path}`);

      return bytes;
    },
  });
}

describe("view_image", () => {
  test("returns the picture itself, with its name and size, for the model to see", async () => {
    const result = await setup({ "shots/home.png": PNG }).call({ path: "shots/home.png" });
    expect(result).toMatchObject({
      content: [
        { type: "text", text: "shots/home.png (image/png, 12 bytes)" },
        {
          type: "file",
          data: { type: "data", data: Buffer.from(PNG).toString("base64") },
          mediaType: "image/png",
          filename: "home.png",
        },
      ],
    });
  });

  test("refuses a file that is not an image, and one that is too large", async () => {
    const big = new Uint8Array(MAX_VIEW_IMAGE_BYTES + 1);
    big.set(PNG);
    const tool = setup({ "notes.txt": new TextEncoder().encode("hello"), "big.png": big });
    await expect(tool.call({ path: "notes.txt" })).rejects.toThrow("is not a PNG, JPEG");
    await expect(tool.call({ path: "big.png" })).rejects.toThrow("up to 5 MiB");
    await expect(tool.call({ path: "missing.png" })).rejects.toThrow("File not found");
  });

  test("the transcript shows which file was looked at", () => {
    const output = {
      type: "content" as const,
      value: [{ type: "text" as const, text: "a.png (image/png, 12 bytes)" }],
    };
    expect(projectToolOutput(output, "view_image")).toEqual({
      status: "done",
      output: "a.png (image/png, 12 bytes)",
    });
  });
});
