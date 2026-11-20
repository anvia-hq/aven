import { describe, expect, test } from "bun:test";
import { MAX_DOCUMENT_BYTES } from "@aven/protocol/runtime-wire";

import { keepFiles } from "./bot-files";
import { MAX_HTML_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "./internal/save-file";
import type { BotFiles } from "./types";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const HTML = new TextEncoder().encode("<!DOCTYPE html><html><body>hi</body></html>");
const MD = new TextEncoder().encode("# Notes\n\nAll good.\n");
const CSV = new TextEncoder().encode("a,b\n1,2\n");

function fakeFiles(
  entries: Record<string, Uint8Array>,
  options: { onRead?: (path: string, abortSignal?: AbortSignal) => void } = {},
) {
  const saved: { bytes: Uint8Array; mediaType: string }[] = [];
  const files: BotFiles = {
    readFile: async ({ path, abortSignal }) => {
      options.onRead?.(path, abortSignal);
      const bytes = entries[path];

      if (!bytes) throw new Error(`File not found: ${path}`);

      return bytes;
    },
    save: async (bytes, mediaType) => {
      saved.push({ bytes, mediaType });
      return `saved-${saved.length}`;
    },
  };
  return { files, saved };
}

describe("keepFiles", () => {
  test("keeps supported images, videos, HTML, PDFs and text documents with basename or explicit title", async () => {
    const { files, saved } = fakeFiles({
      "/workspace/chart.png": PNG,
      "clip.mp4": MP4,
      "page.html": HTML,
      "docs/report.pdf": PDF,
      "notes.md": MD,
      "data.csv": CSV,
    });

    const result = await keepFiles(files, [
      { path: "/workspace/chart.png", title: "Revenue" },
      { path: "clip.mp4" },
      { path: "page.html" },
      { path: "docs/report.pdf" },
      { path: "notes.md" },
      { path: "data.csv" },
    ]);

    expect(result.failed).toEqual([]);
    expect(result.kept).toEqual([
      { name: "saved-1", mediaType: "image/png", title: "Revenue", size: PNG.length },
      { name: "saved-2", mediaType: "video/mp4", title: "clip.mp4", size: MP4.length },
      { name: "saved-3", mediaType: "text/html", title: "page.html", size: HTML.length },
      { name: "saved-4", mediaType: "application/pdf", title: "report.pdf", size: PDF.length },
      { name: "saved-5", mediaType: "text/markdown", title: "notes.md", size: MD.length },
      { name: "saved-6", mediaType: "text/csv", title: "data.csv", size: CSV.length },
    ]);
    expect(saved.map((item) => item.mediaType)).toEqual([
      "image/png",
      "video/mp4",
      "text/html",
      "application/pdf",
      "text/markdown",
      "text/csv",
    ]);
  });

  test("enforces per-type byte limits", async () => {
    const bigPng = new Uint8Array(MAX_IMAGE_BYTES + 1);
    bigPng.set(PNG);
    const bigMp4 = new Uint8Array(MAX_VIDEO_BYTES + 1);
    bigMp4.set(MP4);
    const bigHtml = new Uint8Array(MAX_HTML_BYTES + 1);
    bigHtml.set(HTML);
    const bigPdf = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    bigPdf.set(PDF);

    const { files, saved } = fakeFiles({
      "big.png": bigPng,
      "big.mp4": bigMp4,
      "big.html": bigHtml,
      "big.pdf": bigPdf,
    });

    const result = await keepFiles(files, [
      { path: "big.png" },
      { path: "big.mp4" },
      { path: "big.html" },
      { path: "big.pdf" },
    ]);

    expect(result.kept).toEqual([]);
    expect(saved).toEqual([]);
    expect(result.failed.map((item) => item.path)).toEqual([
      "big.png",
      "big.mp4",
      "big.html",
      "big.pdf",
    ]);
    expect(result.failed[0]?.error).toContain(`image/png up to ${MAX_IMAGE_BYTES}`);
    expect(result.failed[1]?.error).toContain(`video/mp4 up to ${MAX_VIDEO_BYTES}`);
    expect(result.failed[2]?.error).toContain(`text/html up to ${MAX_HTML_BYTES}`);
    expect(result.failed[3]?.error).toContain(`application/pdf up to ${MAX_DOCUMENT_BYTES}`);
  });

  test("refuses unsupported types and reports partial failures alongside kept files", async () => {
    const svg = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    const binaryTxt = new Uint8Array([0x68, 0x69, 0x00, 0x21]);
    const { files } = fakeFiles({
      "logo.svg": svg,
      "bad.txt": binaryTxt,
      "ok.md": MD,
    });

    const result = await keepFiles(files, [
      { path: "logo.svg" },
      { path: "missing.pdf" },
      { path: "bad.txt" },
      { path: "ok.md" },
    ]);

    expect(result.kept).toEqual([
      { name: "saved-1", mediaType: "text/markdown", title: "ok.md", size: MD.length },
    ]);
    expect(result.failed.map((item) => item.path)).toEqual(["logo.svg", "missing.pdf", "bad.txt"]);
    expect(result.failed[0]?.error).toContain("is not an image, video, HTML page, PDF");
    expect(result.failed[1]?.error).toContain("File not found");
    expect(result.failed[2]?.error).toContain("is not an image, video, HTML page, PDF");
  });

  test("rethrows immediately when aborted instead of recording a file failure", async () => {
    const controller = new AbortController();
    const { files } = fakeFiles(
      { "a.md": MD, "b.md": MD },
      {
        onRead: (path, signal) => {
          expect(signal).toBe(controller.signal);

          if (path === "a.md") {
            controller.abort(new Error("cancelled"));
            signal?.throwIfAborted();
          }
        },
      },
    );

    await expect(
      keepFiles(files, [{ path: "a.md" }, { path: "b.md" }], controller.signal),
    ).rejects.toThrow("cancelled");
  });
});
