import { db } from "@aven/db/client";
import {
  environmentVariables as variables,
  type EnvironmentVariableRow,
} from "@aven/db/schema/environment-variables";
import { projects } from "@aven/db/schema/projects";
import type { RunEnvVar } from "@aven/protocol/runtime-wire";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";

import { NotFoundError, UnavailableError, UnprocessableError } from "../../errors";
import { decryptSecret, encryptSecret } from "../providers/crypto";
import { MAX_VARIABLES, type SetVariableBody } from "./schema";

const HINT_MIN_LENGTH = 12;

export class TooManyVariablesError extends UnprocessableError {}

/**
 * Whose variables a call is about (decision 0046): the organization's, one project's, or one
 * person's own in the organization. Every scope carries the organization the caller is in, so
 * another organization's rows are never reached.
 */
export type Scope =
  | { kind: "workspace"; organizationId: string }
  | { kind: "project"; organizationId: string; projectId: string }
  | { kind: "personal"; organizationId: string; userId: string };

const SCOPE_LABEL = { workspace: "workspace", project: "project", personal: "person" } as const;

// The rows of a scope: the organization's, and then whichever of project and person it names.
function inScope(scope: Scope) {
  const organization = eq(variables.organizationId, scope.organizationId);
  switch (scope.kind) {
    case "workspace":
      return and(organization, isNull(variables.projectId), isNull(variables.userId));
    case "project":
      return and(organization, eq(variables.projectId, scope.projectId));
    case "personal":
      return and(organization, eq(variables.userId, scope.userId));
  }
}

// Which unique index a name is held to in a scope, for an upsert to land on.
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

// A value that cannot be decrypted (a rotated PROVIDER_ENCRYPTION_KEY, a damaged row) is
// unavailable, not a server bug: the owner fixes it by entering the value again.
function readValue(row: EnvironmentVariableRow) {
  try {
    return decryptSecret(row.valueEncrypted);
  } catch (error) {
    console.error(`Could not decrypt variable ${row.id}:`, error);
    throw new UnavailableError(`The saved value of ${row.name} could not be read; enter it again`);
  }
}

// Only a long secret shows its end: a short one (a PIN, a word) would be shown whole.
const hint = (value: string) => (value.length >= HINT_MIN_LENGTH ? value.slice(-4) : null);

// What a client sees: a plain variable's value, a secret only as its last characters.
function view(row: EnvironmentVariableRow) {
  return {
    name: row.name,
    secret: row.secret,
    value: row.secret ? null : readValue(row),
    valueHint: row.valueHint,
    updatedAt: row.updatedAt,
  };
}

// A project scope must name a project of the organization: another organization's is not found.
async function requireScope(scope: Scope) {
  if (scope.kind !== "project") return;
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.organizationId, scope.organizationId), eq(projects.id, scope.projectId)),
    );
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

  // Makes the variable or replaces its value and whether it is a secret.
  async set(scope: Scope, name: string, body: SetVariableBody) {
    await requireScope(scope);
    const [existing] = await db
      .select({ id: variables.id })
      .from(variables)
      .where(and(inScope(scope), eq(variables.name, name)));
    if (!existing) {
      const [{ total }] = await db.select({ total: count() }).from(variables).where(inScope(scope));
      if (total! >= MAX_VARIABLES) {
        throw new TooManyVariablesError(
          `A ${SCOPE_LABEL[scope.kind]} has at most ${MAX_VARIABLES} variables`,
        );
      }
    }
    const values = {
      valueEncrypted: encryptSecret(body.value),
      secret: body.secret,
      valueHint: body.secret ? hint(body.value) : null,
    };
    const [row] = await db
      .insert(variables)
      .values({ ...ownerOf(scope), name, ...values })
      .onConflictDoUpdate({ ...conflictOf(scope), set: values })
      .returning();
    return view(row!);
  },

  async remove(scope: Scope, name: string) {
    await requireScope(scope);
    const removed = await db
      .delete(variables)
      .where(and(inScope(scope), eq(variables.name, name)))
      .returning({ id: variables.id });
    if (removed.length === 0) throw new NotFoundError("Variable not found");
  },

  // What a run of the project's threads gets in its commands' environment (decision 0045). The
  // caller has the project from a thread of the organization, so this does not look at the
  // organization again.
  async forRun(projectId: string): Promise<RunEnvVar[]> {
    const rows = await db
      .select()
      .from(variables)
      .where(eq(variables.projectId, projectId))
      .orderBy(asc(variables.name));
    return rows.map((row) => ({ name: row.name, value: readValue(row), secret: row.secret }));
  },
};
