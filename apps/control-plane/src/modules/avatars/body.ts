import { UnprocessableError } from "@aven/server-kit/errors";

export const AVATAR_MAX_BYTES = 256 * 1024;

export async function readCapped(request: Request) {
  const reader = request.body?.getReader();

  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;

    length += value.length;

    if (length > AVATAR_MAX_BYTES) {
      await reader.cancel();
      throw new UnprocessableError("The image is too large: keep it under 256 KB");
    }

    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}
