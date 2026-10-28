import { db } from "@aven/db/client";
import { threads } from "@aven/db/schema/threads";
import { and, desc, eq } from "drizzle-orm";

import { projectsService } from "../projects/service";
import type { CreateThreadBody, UpdateThreadBody } from "./schema";

export class ProjectNotFoundError extends Error {}

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
    const project = await projectsService.get(organizationId, body.projectId);
    if (!project) throw new ProjectNotFoundError("Project not found");
    const [thread] = await db
      .insert(threads)
      .values({
        organizationId,
        projectId: project.id,
        createdBy: userId,
        projectPath: project.projectPath,
        title: body.title ?? project.name,
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
};
