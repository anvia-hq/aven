import { describe, expect, test } from "bun:test";

import { artifactType, videoType } from "./artifact-type";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((char) => char.charCodeAt(0)) : part,
    ),
  );

describe("artifactType", () => {
  test("knows an MP4 by its ftyp box and a WebM by its document type", () => {
    expect(videoType(bytes([0, 0, 0, 0x18], "ftypmp42"))).toBe("video/mp4");
    expect(videoType(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], "webm"))).toBe(
      "video/webm",
    );
  });

  test("does not take a Matroska file that is not WebM, or a text file, for a video", () => {
    expect(
      videoType(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], "matroska")),
    ).toBeNull();
    expect(videoType(bytes("<svg onload='alert(1)'/>"))).toBeNull();
  });

  test("still knows the images", () => {
    expect(artifactType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(artifactType(bytes("plain text"))).toBeNull();
  });
});
