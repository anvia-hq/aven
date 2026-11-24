import { InvalidSkillError, packSkill, skillFolder } from "@aven/agents/skill-package";
import { db } from "@aven/db/client";
import { skills } from "@aven/db/schema/skills";
import { UnprocessableError } from "@aven/server-kit/errors";
import { and, asc, eq } from "drizzle-orm";

import { githubUserTokenService } from "../github/user-tokens";
import { builtinSkills } from "./builtins";
import { SkillInstallError, resolveSkill } from "./install";
import type { InstallSkillBody, UploadSkillBody } from "./schema";
import type { ResolvedInstall, SkillView } from "./types";
import type { SkillRow } from "@aven/db/schema/types";
import type { PackedSkill, SkillFiles } from "@aven/agents/types";
import type { RunSkill } from "@aven/protocol/types";

function view({ archive: _archive, userId: _userId, ...row }: SkillRow): SkillView {
  return row;
}

const viewColumns = {
  id: skills.id,
  name: skills.name,
  description: skills.description,
  enabled: skills.enabled,
  digest: skills.digest,
  size: skills.size,
  fileCount: skills.fileCount,
  createdAt: skills.createdAt,
  updatedAt: skills.updatedAt,
};

const ownSkill = (userId: string, id: string) => and(eq(skills.id, id), eq(skills.userId, userId));

const asRunSkill = ({ name, description, digest }: RunSkill): RunSkill => ({
  name,
  description,
  digest,
});

async function packed(files: SkillFiles) {
  try {
    return await packSkill(files);
  } catch (error) {
    if (error instanceof InvalidSkillError) throw new UnprocessableError(error.message);

    throw error;
  }
}

async function saved(userId: string, skill: PackedSkill) {
  const values = {
    name: skill.name,
    description: skill.description,
    archive: skill.archive,
    digest: skill.digest,
    size: skill.size,
    fileCount: skill.fileCount,
  };
  const [row] = await db
    .insert(skills)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: [skills.userId, skills.name],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  if (!row) throw new Error("The skill was not saved");

  return view(row);
}

export const skillsService = {
  list(userId: string) {
    return db
      .select(viewColumns)
      .from(skills)
      .where(eq(skills.userId, userId))
      .orderBy(asc(skills.name));
  },

  async listBuiltIn() {
    return (await builtinSkills()).map(({ name, description }) => ({ name, description }));
  },

  async upload(userId: string, body: UploadSkillBody) {
    return saved(userId, await packed(skillFolder(body.files)));
  },

  async install(userId: string, body: InstallSkillBody): Promise<ResolvedInstall> {
    const connection = await githubUserTokenService.use(userId).catch(() => null);

    let resolved;
    try {
      resolved = await resolveSkill(body.source, {
        folder: body.folder ?? null,
        token: connection?.token ?? null,
      });
    } catch (error) {
      if (error instanceof SkillInstallError) throw new UnprocessableError(error.message);

      throw error;
    }

    if (resolved.status === "choose") return resolved;

    return { status: "installed", skill: await saved(userId, await packed(resolved.files)) };
  },

  async update(userId: string, id: string, { enabled }: { enabled: boolean }) {
    const [row] = await db
      .update(skills)
      .set({ enabled })
      .where(ownSkill(userId, id))
      .returning(viewColumns);
    return row;
  },

  async remove(userId: string, id: string) {
    const deleted = await db
      .delete(skills)
      .where(ownSkill(userId, id))
      .returning({ id: skills.id });
    return deleted.length > 0;
  },

  async forRun(userId: string): Promise<RunSkill[]> {
    const personal = await db
      .select({ name: skills.name, description: skills.description, digest: skills.digest })
      .from(skills)
      .where(and(eq(skills.userId, userId), eq(skills.enabled, true)));
    const byName = new Map<string, RunSkill>();
    for (const skill of [...(await builtinSkills()), ...personal])
      byName.set(skill.name, asRunSkill(skill));
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  },

  async archive(digest: string) {
    const builtIn = (await builtinSkills()).find((skill) => skill.digest === digest);

    if (builtIn) return builtIn.archive;

    const [row] = await db
      .select({ archive: skills.archive })
      .from(skills)
      .where(eq(skills.digest, digest))
      .limit(1);
    return row?.archive;
  },
};
