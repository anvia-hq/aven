export type Role = "Owner" | "Admin" | "Member" | "Viewer";

export const ROLES: Role[] = ["Admin", "Member", "Viewer"];

export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
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
