import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { FileContent, FileEntry } from "@aven/protocol/runtime-wire";

// A listing past this many entries is cut; a folder that large is not browsed by eye.
const MAX_ENTRIES = 2000;
const MAX_FILE_BYTES = 512 * 1024;
const SNIFF_BYTES = 8192;

// The real path of `path` inside the workspace, or null when it is outside it, is the repository's
// own `.git`, or does not exist. The agent works in a container and can make a symlink there that
// points anywhere on this machine, so what a path resolves to is checked, not what it spells.
async function inside(root: string, path: string) {
  if (path.includes("\0") || isAbsolute(path)) return null;
  const real = await realpath(join(root, path)).catch(() => null);
  if (!real) return null;
  const from = relative(root, real);
  if (from === ".." || from.startsWith(`..${sep}`) || isAbsolute(from)) return null;
  const [first] = from.split(sep);
  return first === ".git" ? null : real;
}

/** The entries of a folder of the workspace, folders first; empty when it is not there. */
export async function listDirectory(root: string, path: string): Promise<FileEntry[]> {
  const top = await realpath(root);
  const real = await inside(top, path);
  if (!real) return [];
  const names = await readdir(real, { withFileTypes: true }).catch(() => []);
  const entries: FileEntry[] = [];
  for (const entry of names) {
    // The repository's own folder is not the project's files. A link is listed as a file; reading it is checked.
    if (entry.name === ".git" && real === top) continue;
    entries.push({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" });
  }
  entries.sort(
    (a, b) =>
      Number(b.type === "directory") - Number(a.type === "directory") ||
      a.name.localeCompare(b.name),
  );
  return entries.slice(0, MAX_ENTRIES);
}

/** A file of the workspace as text, cut at 512 KiB; binary files and missing ones say so. */
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
