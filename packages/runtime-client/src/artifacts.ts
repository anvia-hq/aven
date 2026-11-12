import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ARTIFACT_EXTENSIONS, ARTIFACT_NAME } from "@aven/protocol/runtime-wire";
import type { ArtifactContent } from "@aven/protocol/types";

const EXTENSIONS: Record<string, string> = ARTIFACT_EXTENSIONS;
const MEDIA_TYPES = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([mediaType, extension]) => [extension, mediaType]),
);

export class ArtifactStore {
  constructor(readonly root: string) {}

  async save(threadId: string, bytes: Uint8Array, mediaType: string) {
    const extension = EXTENSIONS[mediaType];

    if (!extension) throw new Error(`Images of type ${mediaType} are not kept`);

    const name = `${crypto.randomUUID()}.${extension}`;
    await this.keep(threadId, name, bytes);
    return name;
  }

  async keep(threadId: string, name: string, bytes: Uint8Array) {
    if (!ARTIFACT_NAME.test(name)) throw new Error(`${name} is not an image name this store gives`);

    const dir = this.#dir(threadId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), bytes);
  }

  async read(threadId: string, name: string): Promise<ArtifactContent | null> {
    if (!ARTIFACT_NAME.test(name)) return null;

    const bytes = await readFile(join(this.#dir(threadId), name)).catch(() => null);

    if (!bytes) return null;

    const mediaType = MEDIA_TYPES[name.slice(name.lastIndexOf(".") + 1)]!;
    return { mediaType, data: bytes.toString("base64") };
  }

  #dir(threadId: string) {
    if (!/^[\w-]+$/.test(threadId)) throw new Error("Invalid thread id");

    return join(this.root, threadId);
  }
}
