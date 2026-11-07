import { mkdir, open } from "node:fs/promises";
import { extname, join } from "node:path";
import { UPLOADS_DIR } from "@aven/agents/attachments";

const MAX_NAME = 120;

export function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.-]+/g, "_").replace(/^[._]+/, "");
  if (!cleaned) return "file";
  if (cleaned.length <= MAX_NAME) return cleaned;
  const extension = extname(cleaned).slice(0, 16);
  return cleaned.slice(0, MAX_NAME - extension.length) + extension;
}

export class UploadStore {
  constructor(readonly root: string) {}

  async dir(threadId: string) {
    if (!/^[\w-]+$/.test(threadId)) throw new Error("Invalid thread id");
    const dir = join(this.root, threadId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async save(threadId: string, name: string, bytes: Uint8Array) {
    const dir = await this.dir(threadId);
    const safe = safeFileName(name);
    const extension = extname(safe);
    const stem = safe.slice(0, safe.length - extension.length);
    for (let copy = 1; ; copy++) {
      const candidate = copy === 1 ? safe : `${stem}-${copy}${extension}`;
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
