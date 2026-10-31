import { db } from "@aven/db/client";
import { projects } from "@aven/db/schema/projects";
import type { RunEnvVar } from "@aven/protocol/runtime-wire";
import { projectVariables, type ProjectVariableRow } from "@aven/db/schema/project-variables";
import { and, asc, count, eq } from "drizzle-orm";

import { NotFoundError, UnavailableError, UnprocessableError } from "../../errors";
import { decryptSecret, encryptSecret } from "../providers/crypto";
import { MAX_VARIABLES, type SetVariableBody } from "./schema";

const HINT_MIN_LENGTH = 12;

export class TooManyVariablesError extends UnprocessableError {}

// A value that cannot be decrypted (a rotated PROVIDER_ENCRYPTION_KEY, a damaged row) is
// unavailable, not a server bug: the owner fixes it by entering the value again.
function readValue(row: ProjectVariableRow) {
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
function view(row: ProjectVariableRow) {
  return {
    name: row.name,
    secret: row.secret,
    value: row.secret ? null : readValue(row),
    valueHint: row.valueHint,
    updatedAt: row.updatedAt,
  };
}

// Every call is scoped to the organization: another organization's project is simply not found.
async function requireProject(organizationId: string, projectId: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)));
  if (!project) throw new NotFoundError("Project not found");
}

export const variablesService = {
  async list(organizationId: string, projectId: string) {
    await requireProject(organizationId, projectId);
    const rows = await db
      .select()
      .from(projectVariables)
      .where(eq(projectVariables.projectId, projectId))
      .orderBy(asc(projectVariables.name));
    return rows.map(view);
  },

  // Makes the variable or replaces its value and whether it is a secret.
  async set(organizationId: string, projectId: string, name: string, body: SetVariableBody) {
    await requireProject(organizationId, projectId);
    const [existing] = await db
      .select({ id: projectVariables.id })
      .from(projectVariables)
      .where(and(eq(projectVariables.projectId, projectId), eq(projectVariables.name, name)));
    if (!existing) {
      const [{ total }] = await db
        .select({ total: count() })
        .from(projectVariables)
        .where(eq(projectVariables.projectId, projectId));
      if (total! >= MAX_VARIABLES) {
        throw new TooManyVariablesError(`A project has at most ${MAX_VARIABLES} variables`);
      }
    }
    const values = {
      valueEncrypted: encryptSecret(body.value),
      secret: body.secret,
      valueHint: body.secret ? hint(body.value) : null,
    };
    const [row] = await db
      .insert(projectVariables)
      .values({ projectId, name, ...values })
      .onConflictDoUpdate({
        target: [projectVariables.projectId, projectVariables.name],
        set: values,
      })
      .returning();
    return view(row!);
  },

  // What a run of the project's threads gets in its commands' environment (decision 0045). The
  // caller has the project from a thread of the organization, so this does not look at the
  // organization again.
  async forRun(projectId: string): Promise<RunEnvVar[]> {
    const rows = await db
      .select()
      .from(projectVariables)
      .where(eq(projectVariables.projectId, projectId))
      .orderBy(asc(projectVariables.name));
    return rows.map((row) => ({ name: row.name, value: readValue(row), secret: row.secret }));
  },

  async remove(organizationId: string, projectId: string, name: string) {
    await requireProject(organizationId, projectId);
    const removed = await db
      .delete(projectVariables)
      .where(and(eq(projectVariables.projectId, projectId), eq(projectVariables.name, name)))
      .returning({ id: projectVariables.id });
    if (removed.length === 0) throw new NotFoundError("Variable not found");
  },
};
