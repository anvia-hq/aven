/** A skill every user has (decision 0035); it cannot be switched off. */
export type BuiltinSkill = {
  name: string;
  description: string;
};

/** A skill the user uploaded; a repository's own skills are not listed here. */
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

/** A file of a skill's folder as it is uploaded: its path in the folder and its bytes in base64. */
export type SkillUploadFile = { path: string; data: string };
