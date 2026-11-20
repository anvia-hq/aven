import { ascii, startsWith } from "./internal/bytes";

export function imageType(bytes: Uint8Array) {
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";

  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";

  if (startsWith(bytes, 0, ascii("GIF8"))) return "image/gif";

  if (startsWith(bytes, 0, ascii("RIFF")) && startsWith(bytes, 8, ascii("WEBP"))) {
    return "image/webp";
  }

  return null;
}
