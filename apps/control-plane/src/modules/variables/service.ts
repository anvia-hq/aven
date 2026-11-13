import { db } from "@aven/db/client";
import { environmentVariables as variables } from "@aven/db/schema/environment-variables";
import { users } from "@aven/db/schema/users";
import { variableEvents } from "@aven/db/schema/variable-events";
import { and, asc, count, desc, eq, isNull, or, sql } from "drizzle-orm";

import { ForbiddenError, NotFoundError, UnprocessableError } from "@aven/server-kit/errors";
import { decryptOrUnavailable, encryptSecret } from "@aven/server-kit/crypto";
import { isOwnerOrAdmin } from "../auth/members";
import { projectsService } from "../projects/service";
import { MAX_VARIABLES, type SetVariableBody } from "./schema";
import type { Scope } from "./types";
import type { EnvironmentVariableRow, NewVariableEventRow } from "@aven/db/schema/types";
import type { RunEnvVar } from "@aven/protocol/types";

const HINT_MIN_LENGTH = 12;

export class TooManyVariablesError extends UnprocessableError {}

const SCOPE_LABEL = { workspace: "workspace", project: "project", personal: "person" } as const;

function inScope(scope: Scope, table: typeof variables | typeof variableEvents = variables) {
  const organization = eq(table.organizationId, scope.organizationId);
  switch (scope.kind) {
    case "workspace":
      return and(organization, isNull(table.projectId), isNull(table.userId));
    case "project":
      return and(organization, eq(table.projectId, scope.projectId));
    case "personal":
      return and(organization, eq(table.userId, scope.userId));
  }
}

const HISTORY_LIMIT = 100;

function conflictOf(scope: Scope) {
  switch (scope.kind) {
    case "workspace":
      return {
        target: [variables.organizationId, variables.name],
        targetWhere: sql`${variables.projectId} is null and ${variables.userId} is null`,
      };
    case "project":
      return {
        target: [variables.projectId, variables.name],
        targetWhere: sql`${variables.projectId} is not null`,
      };
    case "personal":
      return {
        target: [variables.organizationId, variables.userId, variables.name],
        targetWhere: sql`${variables.userId} is not null`,
      };
  }
}

const ownerOf = (scope: Scope) => ({
  organizationId: scope.organizationId,
  projectId: scope.kind === "project" ? scope.projectId : null,
  userId: scope.kind === "personal" ? scope.userId : null,
});

const actorOf = (scope: Scope) => (scope.kind === "personal" ? scope.userId : scope.actorId);

type Source = NewVariableEventRow["source"];

const readValue = (row: EnvironmentVariableRow) =>
  decryptOrUnavailable(row.valueEncrypted, {
    logged: `Could not decrypt variable ${row.id}:`,
    message: `The saved value of ${row.name} could not be read; enter it again`,
  });

const hint = (value: string) => (value.length >= HINT_MIN_LENGTH ? value.slice(-4) : null);

function view(row: EnvironmentVariableRow) {
  return {
    name: row.name,
    secret: row.secret,
    value: row.secret ? null : readValue(row),
    valueHint: row.valueHint,
    updatedAt: row.updatedAt,
  };
}

async function requireAdmin(organizationId: string, userId: string) {
  if (!(await isOwnerOrAdmin(organizationId, userId))) {
    throw new ForbiddenError("Only an owner or an admin can change the workspace's variables");
  }
}

async function requireScope(scope: Scope) {
  if (scope.kind !== "project") return;

  const project = await projectsService.get(scope.organizationId, scope.projectId);

  if (!project) throw new NotFoundError("Project not found");
}

export const variablesService = {
  async list(scope: Scope) {
    await requireScope(scope);
    const rows = await db
      .select()
      .from(variables)
      .where(inScope(scope))
      .orderBy(asc(variables.name));
    return rows.map(view);
  },

  async set(scope: Scope, name: string, body: SetVariableBody, source: Source = "settings") {
    await requireScope(scope);

    if (scope.kind === "workspace") await requireAdmin(scope.organizationId, scope.actorId);

    const values = {
      valueEncrypted: encryptSecret(body.value),
      secret: body.secret,
      valueHint: body.secret ? hint(body.value) : null,
    };
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: variables.id })
        .from(variables)
        .where(and(inScope(scope), eq(variables.name, name)));

      if (!existing) {
        const [{ total }] = await tx
          .select({ total: count() })
          .from(variables)
          .where(inScope(scope));

        if (total! >= MAX_VARIABLES) {
          throw new TooManyVariablesError(
            `A ${SCOPE_LABEL[scope.kind]} has at most ${MAX_VARIABLES} variables`,
          );
        }
      }

      const [saved] = await tx
        .insert(variables)
        .values({ ...ownerOf(scope), name, ...values })
        .onConflictDoUpdate({ ...conflictOf(scope), set: values })
        .returning();
      await tx.insert(variableEvents).values({
        ...ownerOf(scope),
        actorId: actorOf(scope),
        name,
        action: existing ? "updated" : "created",
        secret: body.secret,
        source,
      });
      return saved!;
    });
    return view(row);
  },

  async history(scope: Scope) {
    await requireScope(scope);
    const rows = await db
      .select({
        id: variableEvents.id,
        name: variableEvents.name,
        action: variableEvents.action,
        secret: variableEvents.secret,
        source: variableEvents.source,
        createdAt: variableEvents.createdAt,
        actorName: users.name,
      })
      .from(variableEvents)
      .leftJoin(users, eq(users.id, variableEvents.actorId))
      .where(inScope(scope, variableEvents))
      .orderBy(desc(variableEvents.createdAt), desc(variableEvents.id))
      .limit(HISTORY_LIMIT);
    return rows.map(({ actorName, ...event }) => ({ ...event, actor: actorName }));
  },

  async remove(scope: Scope, name: string) {
    await requireScope(scope);

    if (scope.kind === "workspace") await requireAdmin(scope.organizationId, scope.actorId);

    await db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(variables)
        .where(and(inScope(scope), eq(variables.name, name)))
        .returning({ secret: variables.secret });

      if (!removed) throw new NotFoundError("Variable not found");

      await tx.insert(variableEvents).values({
        ...ownerOf(scope),
        actorId: actorOf(scope),
        name,
        action: "removed",
        secret: removed.secret,
      });
    });
  },

  async forRun(run: {
    organizationId: string;
    projectId: string;
    userId: string;
    withoutPersonal?: boolean;
  }): Promise<RunEnvVar[]> {
    const rows = await db
      .select()
      .from(variables)
      .where(
        and(
          eq(variables.organizationId, run.organizationId),
          or(
            and(isNull(variables.projectId), isNull(variables.userId)),
            eq(variables.projectId, run.projectId),
            run.withoutPersonal ? undefined : eq(variables.userId, run.userId),
          ),
        ),
      );
    const rank = (row: EnvironmentVariableRow) => {
      if (row.userId) return 2;

      return row.projectId ? 1 : 0;
    };
    const merged = new Map<string, EnvironmentVariableRow>();
    for (const row of rows.sort((a, b) => rank(a) - rank(b))) merged.set(row.name, row);
    return [...merged.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({ name: row.name, value: readValue(row), secret: row.secret }));
  },
};
