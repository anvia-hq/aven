import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const PACKAGE_STORES = [".pnpm-store"] as const;

const HEADER = "# Aven: package manager stores, which are never part of a change";

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
