import { db } from "@aven/db/client";
import { projects } from "@aven/db/schema/projects";
import {
  browseDirectory,
  createDirectory,
  resolveProjectPath,
  workspaceErrorFrom,
} from "@aven/agents/workspace";
import type { DirectoryListing } from "@aven/protocol/runtime-wire";
import { and, desc, eq } from "drizzle-orm";

import { RuntimeCallError, RuntimeOfflineError, runtimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import type { CreateProjectBody } from "./schema";

export class DuplicateProjectPathError extends Error {}
export class RuntimeNotFoundError extends Error {}

// Where project folders live: this machine, or a runtime's. Both answer the same three questions.
type Workspace = {
  resolve(path: string): Promise<string>;
  browse(path?: string): Promise<DirectoryListing>;
  mkdir(path: string, name: string): Promise<DirectoryListing>;
};

const localWorkspace: Workspace = {
  resolve: resolveProjectPath,
  browse: browseDirectory,
  mkdir: createDirectory,
};

function remoteWorkspace(runtimeId: string): Workspace {
  const ask = async <T>(method: "fs.resolve" | "fs.browse" | "fs.mkdir", params: unknown) => {
    const connection = runtimeHub.get(runtimeId);
    if (!connection) throw new RuntimeOfflineError();
    try {
      return (await connection.call(method, params)) as T;
    } catch (error) {
      if (error instanceof RuntimeCallError) throw workspaceErrorFrom(error.code, error.message);
      throw error;
    }
  };
  return {
    resolve: (path) => ask<string>("fs.resolve", { path }),
    browse: (path) => ask<DirectoryListing>("fs.browse", { path }),
    mkdir: (path, name) => ask<DirectoryListing>("fs.mkdir", { path, name }),
  };
}

// A runtime must belong to the organization (and not be revoked) before anything is asked of it.
async function workspaceFor(organizationId: string, runtimeId: string | null | undefined) {
  if (!runtimeId) return localWorkspace;
  if (!(await runtimesService.get(organizationId, runtimeId))) {
    throw new RuntimeNotFoundError("Runtime not found");
  }
  return remoteWorkspace(runtimeId);
}

// Drizzle wraps the driver error in a DrizzleQueryError; the Postgres error code is on `.cause`.
const isUniqueViolation = (error: unknown): boolean => {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
};

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
    const workspace = await workspaceFor(organizationId, body.runtimeId);
    const projectPath = await workspace.resolve(body.projectPath);
    try {
      const [project] = await db
        .insert(projects)
        .values({
          organizationId,
          createdBy: userId,
          name: body.name,
          projectPath,
          runtimeId: body.runtimeId ?? null,
        })
        .returning();
      return project!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateProjectPathError(`A project for ${projectPath} already exists`);
      }
      throw error;
    }
  },

  async browse(organizationId: string, runtimeId: string | undefined, path?: string) {
    return (await workspaceFor(organizationId, runtimeId)).browse(path);
  },

  async createDirectory(
    organizationId: string,
    runtimeId: string | undefined,
    parentPath: string,
    name: string,
  ) {
    return (await workspaceFor(organizationId, runtimeId)).mkdir(parentPath, name);
  },
};
