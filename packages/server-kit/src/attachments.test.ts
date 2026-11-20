import { describe, expect, test } from "bun:test";

import { ATTACHMENT_LIMITS } from "@aven/protocol/events";
import { ARTIFACT_NAME } from "@aven/protocol/runtime-wire";

import { attachmentBody, prepareAttachments, withoutBytes } from "./attachments";
import { UnprocessableError } from "./errors";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const GIF_BYTES = new TextEncoder().encode("GIF89a");
const WEBP_BYTES = new TextEncoder().encode("RIFF\x00\x00\x00\x00WEBP");

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

describe("attachmentBody", () => {
  test("accepts valid attachment payloads and trims names", () => {
    expect(
      attachmentBody.parse({
        name: " report.pdf ",
        mediaType: "application/pdf",
        data: toBase64(new Uint8Array([1, 2, 3])),
      }),
    ).toEqual({
      name: "report.pdf",
      mediaType: "application/pdf",
      data: toBase64(new Uint8Array([1, 2, 3])),
    });
  });

  test("rejects blank names, invalid media types, and non-base64 data", () => {
    const valid = toBase64(new Uint8Array([1, 2, 3]));
    expect(attachmentBody.safeParse({ name: "  ", data: valid }).success).toBe(false);
    expect(
      attachmentBody.safeParse({ name: "a.txt", mediaType: "not a mime", data: valid }).success,
    ).toBe(false);
    expect(attachmentBody.safeParse({ name: "a.txt", data: "!!!not-base64!!!" }).success).toBe(
      false,
    );
  });
});

describe("prepareAttachments", () => {
  test("sniffs image types regardless of claimed mediaType and assigns artifact filenames", () => {
    const prepared = prepareAttachments([
      { name: "a.bin", mediaType: "application/octet-stream", data: toBase64(PNG_BYTES) },
      { name: "b.jpg", data: toBase64(JPEG_BYTES) },
      { name: "c.gif", data: toBase64(GIF_BYTES) },
      { name: "d.webp", data: toBase64(WEBP_BYTES) },
    ]);

    expect(prepared.map((file) => file.mediaType)).toEqual([
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ]);
    expect(prepared.map((file) => file.size)).toEqual([
      PNG_BYTES.length,
      JPEG_BYTES.length,
      GIF_BYTES.length,
      WEBP_BYTES.length,
    ]);
    for (const file of prepared) {
      expect(file.image).toMatch(ARTIFACT_NAME);
    }
  });

  test("keeps non-image files with their claimed mediaType or defaults to octet-stream", () => {
    const text = new TextEncoder().encode("hello");
    const [explicit, fallback] = prepareAttachments([
      { name: "notes.txt", mediaType: "text/plain", data: toBase64(text) },
      { name: "blob.bin", data: toBase64(text) },
    ]);

    expect(explicit).toEqual({
      name: "notes.txt",
      mediaType: "text/plain",
      size: 5,
      data: toBase64(text),
    });
    expect(fallback).toEqual({
      name: "blob.bin",
      mediaType: "application/octet-stream",
      size: 5,
      data: toBase64(text),
    });
  });

  test("rejects an image larger than the per-image limit", () => {
    const oversize = new Uint8Array(ATTACHMENT_LIMITS.imageBytes + 1);
    oversize.set(PNG_BYTES);
    expect(() => prepareAttachments([{ name: "huge.png", data: toBase64(oversize) }])).toThrow(
      UnprocessableError,
    );
  });

  test("rejects attachments whose combined size exceeds the total message limit", () => {
    const chunk = new Uint8Array(Math.floor(ATTACHMENT_LIMITS.totalBytes / 2) + 1);
    const data = toBase64(chunk);
    expect(() =>
      prepareAttachments([
        { name: "a.bin", data },
        { name: "b.bin", data },
      ]),
    ).toThrow(UnprocessableError);
  });
});

describe("withoutBytes", () => {
  test("strips base64 data and omits undefined image fields", () => {
    expect(
      withoutBytes({
        name: "chart.png",
        mediaType: "image/png",
        size: 9,
        image: "11111111-2222-4333-8444-555555555555.png",
        data: toBase64(PNG_BYTES),
      }),
    ).toEqual({
      name: "chart.png",
      mediaType: "image/png",
      size: 9,
      image: "11111111-2222-4333-8444-555555555555.png",
    });

    const plain = withoutBytes({
      name: "notes.txt",
      mediaType: "text/plain",
      size: 5,
      data: "aGVsbG8=",
    });
    expect(plain).toEqual({ name: "notes.txt", mediaType: "text/plain", size: 5 });
    expect("image" in plain).toBe(false);
    expect("data" in plain).toBe(false);
  });
});
