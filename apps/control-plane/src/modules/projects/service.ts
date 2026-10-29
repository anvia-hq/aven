import { db } from "@aven/db/client";
import { projects } from "@aven/db/schema/projects";
import { and, desc, eq } from "drizzle-orm";

import { UnprocessableError } from "../../errors";
import { runtimesService } from "../runtimes/service";
import type { CreateProjectBody } from "./schema";

export class RuntimeNotFoundError extends UnprocessableError {}

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

  // A project is a name and the runner its threads' sandboxes run on (decision 0010). The runner
  // must belong to the organization and not be revoked; it need not be online to be chosen.
  async create(organizationId: string, userId: string, body: CreateProjectBody) {
    if (!(await runtimesService.get(organizationId, body.runtimeId))) {
      throw new RuntimeNotFoundError("Runner not found");
    }
    const [project] = await db
      .insert(projects)
      .values({ organizationId, createdBy: userId, name: body.name, runtimeId: body.runtimeId })
      .returning();
    return project!;
  },
};
