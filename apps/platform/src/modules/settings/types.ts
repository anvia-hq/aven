// Better Auth organization roles. Owners come with the organization and cannot be invited.
export const ROLES = ["admin", "member"] as const;

export type InvitableRole = (typeof ROLES)[number];

export const isInvitableRole = (value: unknown): value is InvitableRole =>
  (ROLES as readonly unknown[]).includes(value);

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "pending";
};

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
