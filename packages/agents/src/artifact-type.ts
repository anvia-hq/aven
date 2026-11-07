import { imageType } from "./image-type";

const startsWith = (bytes: Uint8Array, at: number, prefix: readonly number[]) =>
  prefix.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const contains = (bytes: Uint8Array, text: string, within: number) => {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, within));
  return head.includes(text);
};

const NOT_VIDEO_BRANDS = ["heic", "heix", "mif1", "msf1", "avif", "avis", "M4A ", "M4B "];

export function videoType(bytes: Uint8Array) {
  if (startsWith(bytes, 4, ascii("ftyp"))) {
    const brand = new TextDecoder("latin1").decode(bytes.subarray(8, 12));
    return NOT_VIDEO_BRANDS.includes(brand) ? null : "video/mp4";
  }
  if (startsWith(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3]) && contains(bytes, "webm", 64)) {
    return "video/webm";
  }
  return null;
}

export const artifactType = (bytes: Uint8Array) => imageType(bytes) ?? videoType(bytes);
