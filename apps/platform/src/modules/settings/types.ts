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
  image?: string | null;
  status: "active" | "pending";
};

export type FollowUpSettings = {
  enabled: boolean;
  providerId: string | null;
  modelId: string | null;
};
