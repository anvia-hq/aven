import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class CodexThreads {
  #ids = new Map<string, string>();

  constructor(private file: string) {
    if (!existsSync(file)) return;
    try {
      const saved: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (typeof saved === "object" && saved !== null) {
        for (const [thread, codex] of Object.entries(saved)) {
          if (typeof codex === "string") this.#ids.set(thread, codex);
        }
      }
    } catch {
      this.#ids.clear();
    }
  }

  get(threadId: string) {
    return this.#ids.get(threadId);
  }

  set(threadId: string, codexId: string) {
    if (this.#ids.get(threadId) === codexId) return;
    this.#ids.set(threadId, codexId);
    this.#save();
  }

  delete(threadId: string) {
    if (this.#ids.delete(threadId)) this.#save();
  }

  #save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(Object.fromEntries(this.#ids)), { mode: 0o600 });
    renameSync(temporary, this.file);
  }
}
