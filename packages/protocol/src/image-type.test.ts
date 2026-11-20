import { describe, expect, test } from "bun:test";

import { imageType } from "./image-type";

describe("imageType", () => {
  test("detects PNG, JPEG, GIF, and WEBP signatures", () => {
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe(
      "image/png",
    );
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageType(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
    expect(imageType(new TextEncoder().encode("RIFF\x00\x00\x00\x00WEBP"))).toBe("image/webp");
  });

  test("returns null for short buffers, plain text, and non-WEBP RIFF files", () => {
    expect(imageType(new Uint8Array())).toBeNull();
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    expect(imageType(new TextEncoder().encode("hello world"))).toBeNull();
    expect(imageType(new TextEncoder().encode("RIFF\x00\x00\x00\x00WAVE"))).toBeNull();
    expect(imageType(new TextEncoder().encode("RIFF\x00\x00\x00\x00WEB"))).toBeNull();
  });
});
