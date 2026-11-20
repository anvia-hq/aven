const VIEWER_ID_BYTES = 16;
const VIEWER_ID_HEX = /^[0-9a-f]{32}$/i;

export function encodeViewerFrame(viewerId: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const hex = viewerId.replaceAll("-", "");

  if (!VIEWER_ID_HEX.test(hex)) {
    throw new Error("Invalid viewer id: expected 32 hex characters");
  }

  const frame = new Uint8Array(VIEWER_ID_BYTES + payload.length);
  frame.set(Uint8Array.fromHex(hex));
  frame.set(payload, VIEWER_ID_BYTES);
  return frame;
}

export function decodeViewerFrame(frame: Uint8Array) {
  if (frame.length < VIEWER_ID_BYTES) return null;

  const hex = frame.subarray(0, VIEWER_ID_BYTES).toHex();
  const viewerId = [8, 12, 16, 20].reduceRight(
    (id, at) => `${id.slice(0, at)}-${id.slice(at)}`,
    hex,
  );
  return { viewerId, payload: frame.subarray(VIEWER_ID_BYTES) };
}
