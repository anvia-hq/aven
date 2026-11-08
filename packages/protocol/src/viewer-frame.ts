const VIEWER_ID_BYTES = 16;

export function encodeViewerFrame(viewerId: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(VIEWER_ID_BYTES + payload.length);
  frame.set(Uint8Array.fromHex(viewerId.replaceAll("-", "")));
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
