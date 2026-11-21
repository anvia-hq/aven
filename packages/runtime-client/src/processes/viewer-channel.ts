import { encodeViewerFrame } from "@aven/protocol/viewer-frame";

import type { ViewerLink } from "../types";

export const VIEWER_MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

export class ViewerWriteQueue {
  #chunks: Uint8Array[] = [];
  #bytes = 0;

  constructor(private readonly maxBytes: number) {}

  push(bytes: Uint8Array) {
    if (this.#bytes + bytes.length > this.maxBytes) return false;

    this.#chunks.push(bytes.slice());
    this.#bytes += bytes.length;
    return true;
  }

  flush(write: (chunk: Uint8Array) => number) {
    while (this.#chunks.length > 0) {
      const chunk = this.#chunks[0]!;
      const taken = write(chunk);

      if (taken < chunk.length) {
        this.#chunks[0] = chunk.subarray(taken);
        this.#bytes -= taken;
        return;
      }

      this.#chunks.shift();
      this.#bytes -= chunk.length;
    }
  }
}

export function forwardViewerChunk(
  link: ViewerLink,
  viewerId: string,
  chunk: Uint8Array,
  maxBufferedBytes = VIEWER_MAX_BUFFERED_BYTES,
) {
  if (link.buffered() > maxBufferedBytes) return false;

  link.sendBinary(encodeViewerFrame(viewerId, chunk));
  return true;
}
