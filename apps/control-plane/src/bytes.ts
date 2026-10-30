/** The bytes a binary WebSocket message carries, as one view over the same memory. */
export const bytesOf = (view: ArrayBufferView) =>
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
