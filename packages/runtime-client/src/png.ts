import { deflateSync } from "node:zlib";

import type { RfbFrame } from "./types";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Uint8Array) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(Bun.hash.crc32(body) >>> 0, body.length + 4);
  return out;
}

export function scaleFrame({ width, height, rgba }: RfbFrame, scale: number): RfbFrame {
  const toWidth = Math.max(1, Math.round(width * scale));
  const toHeight = Math.max(1, Math.round(height * scale));
  if (toWidth === width && toHeight === height) return { width, height, rgba };
  const out = new Uint8Array(toWidth * toHeight * 4);
  for (let y = 0; y < toHeight; y++) {
    const fromY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / toHeight));
    for (let x = 0; x < toWidth; x++) {
      const fromX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / toWidth));
      const from = (fromY * width + fromX) * 4;
      out.set(rgba.subarray(from, from + 4), (y * toWidth + x) * 4);
    }
  }
  return { width: toWidth, height: toHeight, rgba: out };
}

export function encodePng({ width, height, rgba }: RfbFrame) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = row + 1 + x * 3;
      rows[to] = rgba[from]!;
      rows[to + 1] = rgba[from + 1]!;
      rows[to + 2] = rgba[from + 2]!;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return new Uint8Array(
    Buffer.concat([
      SIGNATURE,
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", new Uint8Array(0)),
    ]),
  );
}
