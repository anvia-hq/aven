import type { SkillRow } from "@aven/db/schema/types";

export type SkillView = Omit<SkillRow, "archive" | "userId">;
