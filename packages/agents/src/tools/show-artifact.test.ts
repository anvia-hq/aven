import { describe, expect, test } from "bun:test";

import { projectToolOutput } from "../tool-projection";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, createShowArtifactTool } from "./show-artifact";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);

function setup(files: Record<string, Uint8Array>) {
  const kept: { bytes: Uint8Array; mediaType: string }[] = [];
  const tool = createShowArtifactTool({
    readFile: async ({ path }) => {
      const bytes = files[path];
      if (!bytes) throw new Error(`File not found: ${path}`);
      return bytes;
    },
    save: async (bytes, mediaType) => {
      kept.push({ bytes, mediaType });
      const extension = mediaType === "video/mp4" ? "mp4" : "png";
      return `00000000-0000-4000-8000-00000000000${kept.length}.${extension}`;
    },
  });
  return { tool, kept };
}

describe("show_artifact", () => {
  test("keeps images and videos together and names each, in order", async () => {
    const { tool, kept } = setup({ "plot.png": PNG, "run.mp4": MP4 });
    const result = await tool.call({
      items: [{ path: "plot.png", caption: "Sales" }, { path: "run.mp4" }],
    });
    expect(result).toEqual({
      artifacts: [
        {
          name: "00000000-0000-4000-8000-000000000001.png",
          mediaType: "image/png",
          caption: "Sales",
        },
        { name: "00000000-0000-4000-8000-000000000002.mp4", mediaType: "video/mp4" },
      ],
      paths: ["plot.png", "run.mp4"],
      failed: [],
    });
    expect(kept.map((file) => file.mediaType)).toEqual(["image/png", "video/mp4"]);
  });

  test("shows what it can and says what it could not, so one bad file does not stop the rest", async () => {
    const svg = new TextEncoder().encode("<svg onload='alert(1)'/>");
    const { tool, kept } = setup({ "plot.png": PNG, "logo.png": svg });
    const result = (await tool.call({
      items: [{ path: "logo.png" }, { path: "missing.png" }, { path: "plot.png" }],
    })) as { artifacts: unknown[]; failed: { path: string; error: string }[] };
    expect(result.artifacts).toHaveLength(1);
    expect(result.failed.map((failure) => failure.path)).toEqual(["logo.png", "missing.png"]);
    expect(result.failed[0]?.error).toContain("is not a PNG, JPEG, GIF, WebP, MP4 or WebM");
    expect(kept).toHaveLength(1);
  });

  test("fails the call when nothing could be shown, with the reason", async () => {
    const { tool } = setup({});
    await expect(tool.call({ items: [{ path: "gone.png" }] })).rejects.toThrow("File not found");
  });

  test("refuses an image or a video past its own limit", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    const longVideo = new Uint8Array(MAX_VIDEO_BYTES + 1);
    longVideo.set(MP4);
    const { tool } = setup({ "big.png": big, "long.mp4": longVideo });
    await expect(tool.call({ items: [{ path: "big.png" }] })).rejects.toThrow("images up to 8 MiB");
    await expect(tool.call({ items: [{ path: "long.mp4" }] })).rejects.toThrow(
      "videos up to 10 MiB",
    );
  });

  test("takes between one and twelve files", async () => {
    const { tool } = setup({});
    await expect(tool.call({ items: [] })).rejects.toThrow();
    await expect(
      tool.call({ items: Array.from({ length: 13 }, () => ({ path: "a.png" })) }),
    ).rejects.toThrow();
  });

  test("its result becomes what a client shows, and another tool's never does", () => {
    const artifacts = [
      { name: "00000000-0000-4000-8000-000000000001.png", mediaType: "image/png" },
    ];
    const output = { type: "json" as const, value: { artifacts, paths: ["a.png"], failed: [] } };
    expect(projectToolOutput(output, "show_artifact")).toEqual({
      status: "done",
      output: "Showed 1",
      artifacts,
    });
    expect(projectToolOutput(output, "web_search").artifacts).toBeUndefined();
    const partial = { ...output, value: { ...output.value, failed: [{ path: "b", error: "x" }] } };
    expect(projectToolOutput(partial, "show_artifact").output).toBe("Showed 1 of 2");
  });

  test("a transcript made with the old show_image still shows its image", () => {
    const image = { name: "00000000-0000-4000-8000-000000000001.png", mediaType: "image/png" };
    const output = { type: "json" as const, value: { image, path: "/tmp/plot.png" } };
    expect(projectToolOutput(output, "show_image")).toEqual({
      status: "done",
      output: "Showed /tmp/plot.png",
      artifacts: [image],
    });
  });
});
