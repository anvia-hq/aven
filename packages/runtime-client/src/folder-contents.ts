import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";

import type {
  FolderFileEntry,
  FoldersFilesResult,
  FoldersReadmeResult,
} from "@aven/protocol/types";

import { resolved, servedPath } from "./folder-browser";

const ENTRIES_MAX = 2000;
const README_MAX_CHARS = 200_000;
const README_NAMES = ["readme.md", "readme.markdown", "readme.mdx", "readme"];

async function insideFolder(dirs: readonly string[], folder: string, path: string) {
  const root = await servedPath(await resolved(dirs), folder);
  const target = await realpath(join(root, path)).catch(() => {
    throw new Error(`${path || "The folder"} is not in the folder`);
  });
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`${path} is outside the folder`);
  }
  return { root, target };
}

async function kindOf(path: string): Promise<FolderFileEntry["type"]> {
  const found = await stat(path).catch(() => undefined);
  return found?.isDirectory() ? "directory" : "file";
}

export async function listFiles(
  dirs: readonly string[],
  folder: string,
  path = "",
): Promise<FoldersFilesResult> {
  const { target } = await insideFolder(dirs, folder, path);
  const names = await readdir(target);
  const entries = await Promise.all(
    names
      .filter((name) => name !== ".git")
      .slice(0, ENTRIES_MAX)
      .map(async (name) => ({
        name,
        path: path === "" ? name : `${path}/${name}`,
        type: await kindOf(join(target, name)),
      })),
  );
  entries.sort(
    (a, b) =>
      Number(b.type === "directory") - Number(a.type === "directory") ||
      a.name.localeCompare(b.name),
  );
  return { entries };
}

export async function readReadme(
  dirs: readonly string[],
  folder: string,
): Promise<FoldersReadmeResult> {
  const { target } = await insideFolder(dirs, folder, "");
  const names = await readdir(target);
  const name = README_NAMES.map((wanted) =>
    names.find((candidate) => candidate.toLowerCase() === wanted),
  ).find((found) => found !== undefined);
  if (!name) return { readme: null };
  const real = await realpath(join(target, name)).catch(() => undefined);
  if (!real || !real.startsWith(target + sep) || (await kindOf(real)) !== "file") {
    return { readme: null };
  }
  const text = await readFile(real, "utf8");
  return {
    readme: {
      name,
      path: name,
      text: text.slice(0, README_MAX_CHARS),
      truncated: text.length > README_MAX_CHARS,
    },
  };
}
