const isContinuationByte = (byte: number) => (byte & 0xc0) === 0x80;

export function validUtf8(bytes: Uint8Array): Uint8Array {
  let start = 0;

  while (start < bytes.length && isContinuationByte(bytes[start] as number)) start += 1;

  return new TextEncoder().encode(new TextDecoder().decode(bytes.subarray(start)));
}
