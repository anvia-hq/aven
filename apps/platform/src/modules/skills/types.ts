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
