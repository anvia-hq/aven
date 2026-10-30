import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Folders a package manager leaves inside the workspace that nobody means to commit or keep. pnpm
 * does it whenever its store cannot share a disk with the project, as in a container with the
 * workspace mounted: a `.pnpm-store` of hundreds of megabytes lands in the repository's root.
 */
export const PACKAGE_STORES = [".pnpm-store"] as const;

const HEADER = "# Aven: package manager stores, which are never part of a change";

/**
 * Keeps the package stores out of git for this workspace only, through the clone's own
 * `.git/info/exclude`, so the repository's `.gitignore` is not touched and the Changes panel, the
 * line count and the agent's `git add -A` all leave them out. Idempotent; a workspace that is not a
 * clone is left alone.
 */
export async function ensureLocalExcludes(root: string) {
  if (!(await stat(join(root, ".git")).catch(() => null))?.isDirectory()) return;
  const file = join(root, ".git", "info", "exclude");
  const text = await readFile(file, "utf8").catch(() => "");
  const lines = new Set(text.split("\n").map((line) => line.trim()));
  const missing = PACKAGE_STORES.map((name) => `${name}/`).filter(
    (pattern) => !lines.has(pattern) && !lines.has(pattern.slice(0, -1)),
  );
  if (missing.length === 0) return;
  await mkdir(join(root, ".git", "info"), { recursive: true });
  const lead = text === "" || text.endsWith("\n") ? "" : "\n";
  await appendFile(file, `${lead}${HEADER}\n${missing.join("\n")}\n`);
}
