import { mkdir, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

import type {
  DirectoryListing,
  FsBrowseParams,
  FsMkdirParams,
  FsResolveParams,
} from "@aven/protocol/runtime-wire";

// The filesystem a runtime exposes for choosing a project: validate a path, browse folders, make
// one. It runs on the machine that owns the disk, which is the control plane for local projects
// and the runtime for the rest (decision 0008).

/** `code` survives the wire, so the control plane can rebuild the right error. */
export class WorkspaceError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_path" | "invalid_name" | "exists",
  ) {
    super(message);
  }
}

export class InvalidProjectPathError extends WorkspaceError {
  constructor(message: string) {
    super(message, "invalid_path");
  }
}
export class InvalidFolderNameError extends WorkspaceError {
  constructor(message: string) {
    super(message, "invalid_name");
  }
}
export class DirectoryExistsError extends WorkspaceError {
  constructor(message: string) {
    super(message, "exists");
  }
}

export function workspaceErrorFrom(code: string | undefined, message: string) {
  if (code === "invalid_path") return new InvalidProjectPathError(message);
  if (code === "invalid_name") return new InvalidFolderNameError(message);
  if (code === "exists") return new DirectoryExistsError(message);
  return new Error(message);
}

// A project path must be an existing absolute directory on this machine. The stored value is
// the resolved real path, so symlinks and `..` segments cannot change what a project points at.
export async function resolveProjectPath(input: string) {
  let expanded = input;
  if (input === "~") expanded = homedir();
  else if (input.startsWith("~/")) expanded = join(homedir(), input.slice(2));
  if (!isAbsolute(expanded)) {
    throw new InvalidProjectPathError("Project path must be an absolute path");
  }
  let real: string;
  try {
    real = await realpath(expanded);
  } catch {
    throw new InvalidProjectPathError(`Directory does not exist: ${input}`);
  }
  if (!(await stat(real)).isDirectory()) {
    throw new InvalidProjectPathError(`Not a directory: ${input}`);
  }
  return real;
}

// Lists the subdirectories of an already-resolved path. Dot-prefixed entries are hidden
// (`.cache`, `.config`, ...) to keep the listing readable.
async function listDirectory(resolved: string): Promise<DirectoryListing> {
  const dirents = await readdir(resolved, { withFileTypes: true });
  const entries = dirents
    .filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith("."))
    .map((dirent) => ({ name: dirent.name, path: join(resolved, dirent.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const parent = dirname(resolved);
  return { path: resolved, parent: parent === resolved ? null : parent, entries };
}

// A folder name is a single path segment: no separators, and not `.`/`..`, which would
// otherwise let a "new folder" request escape the chosen directory.
const isValidFolderName = (name: string) =>
  name.length > 0 && name !== "." && name !== ".." && !name.includes("/");

// Defaults to the home directory for the folder picker's first screen.
export async function browseDirectory(path?: string) {
  return listDirectory(await resolveProjectPath(path && path.length > 0 ? path : homedir()));
}

// Creates a subfolder of an existing directory and returns that directory's listing again, so
// the picker can show the new folder without a second round trip.
export async function createDirectory(parentPath: string, name: string) {
  const parent = await resolveProjectPath(parentPath);
  if (!isValidFolderName(name)) {
    throw new InvalidFolderNameError("Folder name can't be empty or contain a path separator");
  }
  try {
    await mkdir(join(parent, name));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      throw new DirectoryExistsError(`${name} already exists`);
    }
    throw error;
  }
  return listDirectory(parent);
}

// Answers the control plane's filesystem calls on a runtime.
export async function handleFsCall(method: string, params: unknown): Promise<unknown> {
  switch (method) {
    case "fs.resolve":
      return resolveProjectPath((params as FsResolveParams).path);
    case "fs.browse":
      return browseDirectory((params as FsBrowseParams).path);
    case "fs.mkdir": {
      const { path, name } = params as FsMkdirParams;
      return createDirectory(path, name);
    }
    default:
      throw new Error(`Unsupported: ${method}`);
  }
}
