import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import { db } from "@aven/db/client";
import { threads } from "@aven/db/schema/threads";
import { and, desc, eq } from "drizzle-orm";

import type { CreateThreadBody, UpdateThreadBody } from "./schema";

export class InvalidProjectPathError extends Error {}

// A project path must be an existing absolute directory on this machine. The stored value is
// the resolved real path, so symlinks and `..` segments cannot change what a thread points at.
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

const titleFrom = (projectPath: string) =>
  projectPath.split("/").filter(Boolean).at(-1) ?? "Thread";

export const threadsService = {
  list: (organizationId: string) =>
    db
      .select()
      .from(threads)
      .where(eq(threads.organizationId, organizationId))
      .orderBy(desc(threads.updatedAt)),

  // Every lookup is scoped to the organization: another organization's thread is simply not found.
  async get(organizationId: string, id: string) {
    const [thread] = await db
      .select()
      .from(threads)
      .where(and(eq(threads.organizationId, organizationId), eq(threads.id, id)));
    return thread ?? null;
  },

  async create(organizationId: string, userId: string, body: CreateThreadBody) {
    const projectPath = await resolveProjectPath(body.projectPath);
    const [thread] = await db
      .insert(threads)
      .values({
        organizationId,
        createdBy: userId,
        projectPath,
        title: body.title ?? titleFrom(projectPath),
      })
      .returning();
    return thread!;
  },

  async update(organizationId: string, id: string, body: UpdateThreadBody) {
    const [thread] = await db
      .update(threads)
      .set(body)
      .where(and(eq(threads.organizationId, organizationId), eq(threads.id, id)))
      .returning();
    return thread ?? null;
  },

  // Bumps the thread to the top of the list after the agent has worked on it.
  async touch(id: string) {
    await db.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, id));
  },

  // Distinct project paths this organization has used, most recent first, for quick picking.
  async recentPaths(organizationId: string, limit = 8) {
    const rows = await db
      .select({ projectPath: threads.projectPath })
      .from(threads)
      .where(eq(threads.organizationId, organizationId))
      .orderBy(desc(threads.updatedAt));
    return [...new Set(rows.map((row) => row.projectPath))].slice(0, limit);
  },
};
