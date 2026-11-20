export const startsWith = (bytes: Uint8Array, at: number, prefix: readonly number[]) =>
  prefix.every((byte, index) => bytes[at + index] === byte);

export const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
