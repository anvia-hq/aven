import { mkdir, open } from "node:fs/promises";
import { extname, join } from "node:path";
import { UPLOADS_DIR } from "@aven/agents/attachments";

const MAX_NAME = 120;

// A name that is safe as one path segment and easy to use in a shell: no separators, spaces or
// quotes, and no leading dot, so never `..` or hidden.
export function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.-]+/g, "_").replace(/^[._]+/, "");
  if (!cleaned) return "file";
  if (cleaned.length <= MAX_NAME) return cleaned;
  const extension = extname(cleaned).slice(0, 16);
  return cleaned.slice(0, MAX_NAME - extension.length) + extension;
}

// The files users attach to messages, kept by the runner in `<root>/<thread id>/` and mounted
// read-only at /uploads in the thread's container (decision 0034). They live outside the container
// and the workspace: they outlast a released sandbox, and never show in the thread's changes.
export class UploadStore {
  constructor(readonly root: string) {}

  /** The thread's directory on this machine, the one its container mounts. */
  async dir(threadId: string) {
    // Thread ids come from the control plane, which is trusted, but one is still never a path.
    if (!/^[\w-]+$/.test(threadId)) throw new Error("Invalid thread id");
    const dir = join(this.root, threadId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /** Writes a file the user sent and returns where the agent finds it; a name already taken gets a number. */
  async save(threadId: string, name: string, bytes: Uint8Array) {
    const dir = await this.dir(threadId);
    const safe = safeFileName(name);
    const extension = extname(safe);
    const stem = safe.slice(0, safe.length - extension.length);
    for (let copy = 1; ; copy++) {
      const candidate = copy === 1 ? safe : `${stem}-${copy}${extension}`;
      // `wx` fails when the file exists, so two messages never write over each other.
      const file = await open(join(dir, candidate), "wx").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") return undefined;
        throw error;
      });
      if (!file) continue;
      try {
        await file.writeFile(bytes);
      } finally {
        await file.close();
      }
      return `${UPLOADS_DIR}/${candidate}`;
    }
  }
}
