import type { ModelConfig } from "@aven/agents/types";
import type { ProviderRow } from "@aven/db/schema/types";
import type {
  AgentBackendKind,
  BotProviderView,
  Provider,
  ProviderKeyAsk,
} from "@aven/protocol/types";

export type BotProviders = {
  list(userId: string): Promise<BotProviderView[]>;
  add(
    userId: string,
    input: {
      kind: Provider;
      name: string;
      baseUrl?: string;
      modelId?: string;
      isDefault?: boolean;
    },
  ): Promise<BotProviderView>;
  update(
    userId: string,
    id: string,
    patch: { name?: string; baseUrl?: string; modelId?: string; isDefault?: true },
  ): Promise<BotProviderView>;
  remove(userId: string, id: string): Promise<void>;
  models(userId: string, id: string): Promise<{ models: string[] }>;
  keyFor(userId: string, id: string): Promise<ProviderKeyAsk>;
};

export type ModelFacts = {
  effortLevels: string[] | null;
  defaultEffort: string | null;
  contextWindow: number | null;
  label: string | null;
};

export type GatewayModel = ModelFacts & { effortKnown: boolean };

export type ProviderKind = ModelConfig["provider"];

export type ModelSource = { kind: ProviderKind; apiKey?: string; baseUrl?: string };

export type ModelSelection = { providerId?: string; modelId?: string; reasoningEffort?: string };

export type ProviderView = Omit<ProviderRow, "apiKeyEncrypted" | "keyDigest" | "userId"> & {
  hasKey: boolean;
  backend: AgentBackendKind;
  managed?: boolean;
};

export type RunnableProvider = ProviderRow & {
  allowedModels?: string[] | null;
};

export type ModelEfforts = { options: string[]; defaultValue: string | null };

export type ProviderCatalog = {
  models: string[];
  labels: Record<string, string>;
  efforts: Record<string, ModelEfforts>;
};

export type BotSettingsModel = {
  providerId: string | null;
  modelId: string | null;
  reasoningEffort: string | null;
};

export type BotRunChoice = {
  backend: AgentBackendKind;
  model?: ModelConfig;
  token?: string;
  modelId?: string;
  effort?: string;
};

export type ThreadModel = {
  agentBackend: AgentBackendKind;
  modelProviderId: string | null;
  modelId: string | null;
  reasoningEffort: string | null;
};
