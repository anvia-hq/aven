import { describe, expect, test } from "bun:test";

import { decodeViewerFrame, encodeViewerFrame } from "./viewer-frame";

describe("viewer frames", () => {
  test("carry a viewer id and bytes both ways", () => {
    const viewerId = crypto.randomUUID();
    const frame = encodeViewerFrame(viewerId, new Uint8Array([1, 2, 3]));
    expect(decodeViewerFrame(frame)).toEqual({ viewerId, payload: new Uint8Array([1, 2, 3]) });
  });

  test("carry an empty payload", () => {
    const viewerId = crypto.randomUUID();
    expect(decodeViewerFrame(encodeViewerFrame(viewerId, new Uint8Array()))?.payload).toHaveLength(
      0,
    );
  });

  test("a frame too short for a viewer id is refused", () => {
    expect(decodeViewerFrame(new Uint8Array(15))).toBeNull();
  });
});
