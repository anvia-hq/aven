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

export const PROVIDER_KINDS = ["openai", "anthropic", "openai-compatible"] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  "openai-compatible": "OpenAI-compatible",
};

// Providers belong to the signed-in user. The API never returns the key, only its last characters.
export type Provider = {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string | null;
  modelId: string | null;
  hasKey: boolean;
  keyHint: string | null;
  isDefault: boolean;
  createdAt: string;
};

export type NewProvider = {
  kind: ProviderKind;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
};
