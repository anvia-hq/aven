import { imageType } from "./image-type";

const startsWith = (bytes: Uint8Array, at: number, prefix: readonly number[]) =>
  prefix.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const contains = (bytes: Uint8Array, text: string, within: number) => {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, within));
  return head.includes(text);
};

/**
 * The type of a video, from its first bytes rather than its name: an MP4 (an `ftyp` box first) or a
 * WebM (a Matroska header that names the `webm` document type). Null for anything else.
 */
export function videoType(bytes: Uint8Array) {
  if (startsWith(bytes, 4, ascii("ftyp"))) return "video/mp4";
  if (startsWith(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3]) && contains(bytes, "webm", 64)) {
    return "video/webm";
  }
  return null;
}

/** What an artifact the agent shows is: an image or a video the browser plays, never anything that can carry script. */
export const artifactType = (bytes: Uint8Array) => imageType(bytes) ?? videoType(bytes);
