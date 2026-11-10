import { describe, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";

import { encodePng, scaleFrame } from "./png";

const frame = (width: number, height: number) => {
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    rgba.set([index % 256, (index * 3) % 256, 200, 255], index * 4);
  }
  return { width, height, rgba };
};

describe("png", () => {
  test("a frame becomes a valid PNG: signature, size, checksums and the pixels back", () => {
    const source = frame(5, 4);
    const png = Buffer.from(encodePng(source));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([5, 4]);
    expect(png.subarray(12, 16).toString()).toBe("IHDR");

    let at = 8;
    const idat: Buffer[] = [];
    while (at < png.length) {
      const length = png.readUInt32BE(at);
      const type = png.subarray(at + 4, at + 8).toString();
      const body = png.subarray(at + 8, at + 8 + length);
      expect(png.readUInt32BE(at + 8 + length)).toBe(
        Bun.hash.crc32(png.subarray(at + 4, at + 8 + length)) >>> 0,
      );
      if (type === "IDAT") idat.push(body);
      at += 12 + length;
    }
    const rows = inflateSync(Buffer.concat(idat));
    expect(rows.length).toBe((5 * 3 + 1) * 4);
    expect([...rows.subarray(1, 4)]).toEqual([...source.rgba.subarray(0, 3)]);
    expect([...rows.subarray(16 + 1 + 12, 16 + 1 + 15)]).toEqual([
      ...source.rgba.subarray((5 + 4) * 4, (5 + 4) * 4 + 3),
    ]);
  });

  test("scaling picks pixels at the new size and leaves a scale of one alone", () => {
    const source = frame(8, 4);
    const half = scaleFrame(source, 0.5);
    expect([half.width, half.height]).toEqual([4, 2]);
    expect([...half.rgba.subarray(0, 4)]).toEqual([
      ...source.rgba.subarray((1 * 8 + 1) * 4, (1 * 8 + 1) * 4 + 4),
    ]);
    expect(scaleFrame(source, 1).rgba).toBe(source.rgba);
    expect(scaleFrame(frame(1, 1), 0.01).width).toBe(1);
  });
});
