import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ARTIFACT_EXTENSIONS,
  ARTIFACT_NAME,
  type ArtifactContent,
} from "@aven/protocol/runtime-wire";

const EXTENSIONS: Record<string, string> = ARTIFACT_EXTENSIONS;
const MEDIA_TYPES = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([mediaType, extension]) => [extension, mediaType]),
);

// The images agents showed, kept by the runner in `<root>/<thread id>/<uuid>.<ext>` (decision
// 0033). They live outside the workspace and the container, so they stay readable once the sandbox
// is released, and the agent cannot reach them to change one or plant a link.
export class ArtifactStore {
  constructor(readonly root: string) {}

  /** Keeps a copy of an image and returns the name it is read back by. */
  async save(threadId: string, bytes: Uint8Array, mediaType: string) {
    const extension = EXTENSIONS[mediaType];
    if (!extension) throw new Error(`Images of type ${mediaType} are not kept`);
    const name = `${crypto.randomUUID()}.${extension}`;
    await this.keep(threadId, name, bytes);
    return name;
  }

  /** Keeps an image under a name the control plane gave it: one a user attached (decision 0034). */
  async keep(threadId: string, name: string, bytes: Uint8Array) {
    if (!ARTIFACT_NAME.test(name)) throw new Error(`${name} is not an image name this store gives`);
    const dir = this.#dir(threadId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), bytes);
  }

  /** An image of the thread's, in base64; null when the name is not one this store gives or it is gone. */
  async read(threadId: string, name: string): Promise<ArtifactContent | null> {
    if (!ARTIFACT_NAME.test(name)) return null;
    const bytes = await readFile(join(this.#dir(threadId), name)).catch(() => null);
    if (!bytes) return null;
    const mediaType = MEDIA_TYPES[name.slice(name.lastIndexOf(".") + 1)]!;
    return { mediaType, data: bytes.toString("base64") };
  }

  // Thread ids come from the control plane, which is trusted, but one is still never a path.
  #dir(threadId: string) {
    if (!/^[\w-]+$/.test(threadId)) throw new Error("Invalid thread id");
    return join(this.root, threadId);
  }
}
