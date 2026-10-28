import { mkdir, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

import { db } from "@aven/db/client";
import { projects } from "@aven/db/schema/projects";
import { and, desc, eq } from "drizzle-orm";

import type { CreateProjectBody } from "./schema";

export class InvalidProjectPathError extends Error {}
export class DuplicateProjectPathError extends Error {}
export class InvalidFolderNameError extends Error {}
export class DirectoryExistsError extends Error {}

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

// Drizzle wraps the driver error in a DrizzleQueryError; the Postgres error code is on `.cause`.
const isUniqueViolation = (error: unknown): boolean => {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
};

// Lists the subdirectories of an already-resolved path. Dot-prefixed entries are hidden
// (`.cache`, `.config`, ...) to keep the listing readable.
async function listDirectory(resolved: string) {
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

export const projectsService = {
  list: (organizationId: string) =>
    db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, organizationId))
      .orderBy(desc(projects.updatedAt)),

  // Every lookup is scoped to the organization: another organization's project is simply not found.
  async get(organizationId: string, id: string) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), eq(projects.id, id)));
    return project ?? null;
  },

  async create(organizationId: string, userId: string, body: CreateProjectBody) {
    const projectPath = await resolveProjectPath(body.projectPath);
    try {
      const [project] = await db
        .insert(projects)
        .values({ organizationId, createdBy: userId, name: body.name, projectPath })
        .returning();
      return project!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateProjectPathError(`A project for ${projectPath} already exists`);
      }
      throw error;
    }
  },

  // Defaults to the home directory for the folder picker's first screen.
  async browse(path?: string) {
    const resolved = await resolveProjectPath(path && path.length > 0 ? path : homedir());
    return listDirectory(resolved);
  },

  // Creates a subfolder of an existing directory and returns that directory's listing again, so
  // the picker can show the new folder without a second round trip.
  async createDirectory(parentPath: string, name: string) {
    const parent = await resolveProjectPath(parentPath);
    if (!isValidFolderName(name)) {
      throw new InvalidFolderNameError("Folder name can't be empty or contain a path separator");
    }
    try {
      await mkdir(join(parent, name));
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        throw new DirectoryExistsError(`${name} already exists`);
      }
      throw error;
    }
    return listDirectory(parent);
  },
};
