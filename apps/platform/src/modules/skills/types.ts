export type BuiltinSkill = {
  name: string;
  description: string;
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  digest: string;
  size: number;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SkillUploadFile = { path: string; data: string };

export type SkillChoice = { name: string; folder: string };

export type SkillInstall =
  | { status: "installed"; skill: Skill }
  | { status: "choose"; choices: SkillChoice[] };
