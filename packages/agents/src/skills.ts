import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { SkillValidationError, skill } from "@anvia/core";
import type { Skill } from "@anvia/core/skills";

import { errorMessage } from "./values";

/** Where the sandbox has the skills of a run (decision 0035); read-only. */
export const SKILLS_DIR = "/skills";

/** Where a repository keeps its own skills, relative to its root. */
export const REPO_SKILLS_DIR = ".aven/skills";

/** A skill's name, as Anvia requires it: also the name of its folder, so always one path segment. */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SKILL_NAME = 64;

/** A skill as the agent is told of it: `path` is its SKILL.md in the sandbox. */
export type SkillListing = { name: string; description: string; path: string };

/** Why a skill folder was left out. */
export function skillProblem(error: unknown) {
  if (error instanceof SkillValidationError)
    return error.issues.map((issue) => issue.message).join("; ");
  return errorMessage(error);
}

/** The skill in one folder (its SKILL.md validated by Anvia), or why it is not one. */
export async function readSkillFolder(
  dir: string,
): Promise<{ skill: Skill } | { problem: string }> {
  try {
    const [found] = await skill.local(dir).load();
    return found ? { skill: found } : { problem: "SKILL.md is missing" };
  } catch (error) {
    return { problem: skillProblem(error) };
  }
}

/**
 * The skills in the folders of `dir`, one per folder. A folder that is not a valid skill is
 * reported and left out, so one broken skill never hides the others. A missing `dir` has none.
 */
export async function readSkillFolders(dir: string) {
  const skills: Skill[] = [];
  const problems: { folder: string; problem: string }[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const read = await readSkillFolder(join(dir, entry.name));
    if ("skill" in read) skills.push(read.skill);
    else problems.push({ folder: entry.name, problem: read.problem });
  }
  return { skills, problems };
}

/** What the agent is told about the skills it has; empty without any. */
export function skillsInstructions(skills: readonly SkillListing[]) {
  if (skills.length === 0) return "";
  return [
    "You have skills: instructions for particular kinds of task, kept as files in the sandbox. Before a task one of them fits, read its SKILL.md with read_file and follow it. A skill's other files (references/, scripts/) are next to its SKILL.md; read them when it says to, and run its scripts with exec_command. Skills are read-only.",
    "Available skills:",
    ...skills.map((entry) => `- ${entry.name}: ${entry.description} (${entry.path})`),
  ].join("\n");
}
