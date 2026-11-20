import { describe, expect, test } from "bun:test";

import { bytesOf } from "./bytes";

describe("bytesOf", () => {
  test("wraps a Buffer or TypedArray view respecting byteOffset and byteLength", () => {
    const backing = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const slice = backing.subarray(2, 5);
    const bytes = bytesOf(slice);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([30, 40, 50]);
    expect(bytes.buffer).toBe(backing.buffer);

    const view = new DataView(backing.buffer, 1, 3);
    expect([...bytesOf(view)]).toEqual([20, 30, 40]);

    const buf = Buffer.from([1, 2, 3]);
    expect([...bytesOf(buf)]).toEqual([1, 2, 3]);
  });
});
