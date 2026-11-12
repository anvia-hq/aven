import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { FILE_SEARCH_LIMIT } from "@aven/protocol/runtime-wire";

import { git } from "./git-clone";
import { hostGit } from "./host-git";
import type { FileContent, FileEntry } from "@aven/protocol/types";
import type { Git } from "./types";

const MAX_ENTRIES = 2000;
const MAX_FILE_BYTES = 512 * 1024;
const SNIFF_BYTES = 8192;

async function inside(root: string, path: string) {
  if (path.includes("\0") || isAbsolute(path)) return null;

  const real = await realpath(join(root, path)).catch(() => null);

  if (!real) return null;

  const from = relative(root, real);

  if (from === ".." || from.startsWith(`..${sep}`) || isAbsolute(from)) return null;

  return from.split(sep).includes(".git") ? null : real;
}

export async function listDirectory(root: string, path: string): Promise<FileEntry[]> {
  const top = await realpath(root);
  const real = await inside(top, path);

  if (!real) return [];

  const names = await readdir(real, { withFileTypes: true }).catch(() => []);
  const entries: FileEntry[] = [];
  for (const entry of names) {
    if (entry.name === ".git") continue;

    entries.push({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" });
  }
  entries.sort(
    (a, b) =>
      Number(b.type === "directory") - Number(a.type === "directory") ||
      a.name.localeCompare(b.name),
  );
  return entries.slice(0, MAX_ENTRIES);
}

async function knownFiles(root: string, run: Git) {
  const list = async (...args: string[]) => {
    const { code, stdout } = await run(["ls-files", "-z", ...args], { cwd: root });
    return code === 0 ? stdout.split("\0").filter(Boolean) : [];
  };
  const deleted = new Set(await list("--deleted"));
  return (await list("--cached", "--others", "--exclude-standard")).filter(
    (path) => !deleted.has(path),
  );
}

function rank(path: string, query: string) {
  const name = basename(path).toLowerCase();

  if (name.startsWith(query)) return 0;

  if (name.includes(query)) return 1;

  return path.toLowerCase().includes(query) ? 2 : undefined;
}

export async function searchWorkspace(root: string, query: string, run: Git = git) {
  const wanted = query.trim().toLowerCase();
  const found: { path: string; rank: number }[] = [];
  for (const path of await knownFiles(root, hostGit(run))) {
    const at = rank(path, wanted);

    if (at !== undefined) found.push({ path, rank: at });
  }
  found.sort(
    (a, b) => a.rank - b.rank || a.path.length - b.path.length || a.path.localeCompare(b.path),
  );
  return found.slice(0, FILE_SEARCH_LIMIT).map(({ path }) => path);
}

export async function readWorkspaceFile(root: string, path: string): Promise<FileContent> {
  const real = await inside(await realpath(root), path);

  if (!real || !(await lstat(real)).isFile()) return { kind: "missing" };

  const file = Bun.file(real);
  const size = file.size;
  const bytes = new Uint8Array(await file.slice(0, MAX_FILE_BYTES).arrayBuffer());

  if (bytes.subarray(0, SNIFF_BYTES).includes(0)) return { kind: "binary", size };

  return {
    kind: "text",
    text: new TextDecoder().decode(bytes),
    size,
    truncated: size > MAX_FILE_BYTES,
  };
}
