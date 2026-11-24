import type { SkillFiles } from "@aven/agents/types";
import type { SkillRow } from "@aven/db/schema/types";

export type SkillView = Omit<SkillRow, "archive" | "userId">;

export type SkillSource = {
  owner: string;
  repo: string;
  ref: string | null;
  folder: string | null;
  name: string | null;
};

export type SkillCandidate = { name: string; folder: string };

export type ResolvedSkill =
  | { status: "skill"; folder: string; files: SkillFiles }
  | { status: "choose"; choices: SkillCandidate[] };

export type ResolvedInstall =
  | { status: "installed"; skill: SkillView }
  | { status: "choose"; choices: SkillCandidate[] };

export type SkillFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type InstallOptions = {
  folder?: string | null;
  token?: string | null;
  fetch?: SkillFetch;
};
