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

/** The reasoning levels a model accepts, lowest first, and the one it uses when none is sent. */
export type ModelEfforts = { options: string[]; defaultValue: string | null };

/** What a provider offers: its model ids, and the effort levels of those that have any. */
export type ProviderModels = { models: string[]; efforts: Record<string, ModelEfforts> };
