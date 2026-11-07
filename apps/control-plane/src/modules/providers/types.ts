import type { BotProviderView, ProviderKeyAsk } from "@aven/protocol/providers";
import type { Provider } from "@aven/protocol/runtime-wire";
import type { ModelConfig } from "@aven/agents/model";
import type { ProviderRow } from "@aven/db/schema/providers";

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

export type GatewayModel = { contextWindow: number | null; effortLevels: string[] | null };

export type ProviderKind = ModelConfig["provider"];

export type ModelSource = { kind: ProviderKind; apiKey?: string; baseUrl?: string };

export type ModelSelection = { providerId?: string; modelId?: string; reasoningEffort?: string };

export type ProviderView = Omit<ProviderRow, "apiKeyEncrypted" | "userId"> & { hasKey: boolean };
