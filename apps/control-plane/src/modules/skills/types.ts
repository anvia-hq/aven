import type { SkillRow } from "@aven/db/schema/types";

export type SkillFiles = Map<string, Uint8Array>;

export type PackedSkill = {
  name: string;
  description: string;
  archive: Uint8Array;
  digest: string;
  size: number;
  fileCount: number;
};

export type SkillView = Omit<SkillRow, "archive" | "userId">;
