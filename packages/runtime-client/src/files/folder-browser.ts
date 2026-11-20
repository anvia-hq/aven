import { mkdir, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";

import type { FoldersListResult } from "@aven/protocol/types";

export const insideAny = (dirs: readonly string[], path: string) =>
  dirs.some((dir) => path === dir || path.startsWith(dir + sep));

export const resolved = (dirs: readonly string[]) =>
  Promise.all(dirs.map((dir) => realpath(dir).catch(() => dir)));

export async function servedPath(dirs: readonly string[], path: string) {
  const real = await realpath(path).catch(() => {
    throw new Error(`The folder ${path} is not on this machine`);
  });

  if (!insideAny(dirs, real)) throw new Error(`This runner does not serve ${path}`);

  return real;
}

const isGit = (path: string) =>
  stat(join(path, ".git")).then(
    () => true,
    () => false,
  );

async function entry(path: string) {
  return { name: basename(path), path, git: await isGit(path) };
}

export async function listFolders(
  given: readonly string[],
  path: string | undefined,
): Promise<FoldersListResult> {
  const dirs = await resolved(given);

  if (dirs.length === 0) throw new Error("This runner serves no folders");

  if (path === undefined || path === "") {
    return { path: null, parent: null, folders: await Promise.all(dirs.map(entry)) };
  }

  const real = await servedPath(dirs, path);
  const names = await readdir(real, { withFileTypes: true });
  const children = names
    .flatMap((child) =>
      child.isDirectory() && !child.name.startsWith(".") ? [join(real, child.name)] : [],
    )
    .sort((a, b) => a.localeCompare(b));
  const up = dirname(real);
  return {
    path: real,
    parent: insideAny(dirs, up) && up !== real ? up : null,
    folders: await Promise.all(children.map(entry)),
  };
}

export async function createFolder(given: readonly string[], parent: string, name: string) {
  const dirs = await resolved(given);

  if (dirs.length === 0) throw new Error("This runner serves no folders");

  const clean = name.trim();

  if (!clean || clean === "." || clean === ".." || /[\\/\0]/.test(clean)) {
    throw new Error("A folder name cannot be empty or hold a slash");
  }

  const real = await servedPath(dirs, parent);
  const made = join(real, clean);
  await mkdir(made).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error(`${clean} already exists here`);

    throw error;
  });
  return { path: await realpath(made) };
}
