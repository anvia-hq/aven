// Better Auth organization roles. Owners come with the organization and cannot be invited.
export const ROLES = ["admin", "member"] as const;

export type InvitableRole = (typeof ROLES)[number];

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

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type IntegrationIcon = "github" | "slack" | "linear" | "sentry" | "postgres" | "browser";

export type Integration = {
  id: string;
  name: string;
  description: string;
  icon: IntegrationIcon;
  connected: boolean;
};

export type UsagePoint = {
  date: string;
  tokens: number;
  cost: number;
};
