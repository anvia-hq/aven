function matches(bytes: Uint8Array, offset: number, signature: readonly number[]) {
  if (bytes.length < offset + signature.length) return false;

  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function imageType(bytes: Uint8Array) {
  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";

  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";

  if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return "image/gif";

  if (matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp";
  }

  return null;
}
