import { db } from "@aven/db/client";
import { providers, type ProviderRow } from "@aven/db/schema/providers";
import { reasoningControlsFor, type ModelConfig, type ReasoningControls } from "@aven/agents/model";
import { and, asc, eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "./crypto";
import { modelCatalog } from "./model-catalog";
import type { CreateProviderBody, UpdateProviderBody } from "./schema";

export class InvalidProviderError extends Error {}
export class ModelListError extends Error {}
// A message asked for a provider, model or effort the user cannot run with.
export class InvalidSelectionError extends Error {}

// What a message may choose beyond the user's default: one of their own providers, a model of it
// and a reasoning effort that model supports.
export type ModelSelection = { providerId?: string; modelId?: string; reasoningEffort?: string };

// A model's effort levels: the SDK's own list, or for a model newer than the SDK the one models.dev
// lists (`effortLevels`, which the model must then be built with for the SDK to accept it).
async function effortsFor(kind: ModelConfig["provider"], modelId: string | undefined) {
  const sdk = reasoningControlsFor({ provider: kind, modelId });
  if (sdk || !modelId) return { controls: sdk, effortLevels: undefined };
  const effortLevels = (await modelCatalog.efforts(kind, modelId)) ?? undefined;
  return {
    controls: reasoningControlsFor({ provider: kind, modelId, effortLevels }),
    effortLevels,
  };
}

// The effort levels of each listed model that has any; models without the control are left out.
export async function effortsByModel(kind: ModelConfig["provider"], ids: string[]) {
  const entries = await Promise.all(
    ids.map(async (id) => [id, (await effortsFor(kind, id)).controls] as const),
  );
  return Object.fromEntries(entries.filter(([, controls]) => controls)) as Record<
    string,
    ReasoningControls
  >;
}

type ModelSource = { kind: string; apiKey?: string; baseUrl?: string };

// Asks the provider itself which models the key can use (`GET <base>/models`). `fetchFn` is
// injectable so tests never hit the network.
export async function fetchModels(source: ModelSource, fetchFn: typeof fetch = fetch) {
  let url: string;
  const headers: Record<string, string> = {};
  if (source.kind === "anthropic") {
    if (!source.apiKey) throw new ModelListError("An API key is needed to list models");
    url = "https://api.anthropic.com/v1/models?limit=1000";
    headers["x-api-key"] = source.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    if (source.kind === "openai") {
      if (!source.apiKey) throw new ModelListError("An API key is needed to list models");
      url = "https://api.openai.com/v1/models";
    } else {
      if (!source.baseUrl) throw new ModelListError("A base URL is needed to list models");
      url = `${source.baseUrl.replace(/\/+$/, "")}/models`;
    }
    if (source.apiKey) headers.authorization = `Bearer ${source.apiKey}`;
  }

  let res: Response;
  try {
    res = await fetchFn(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ModelListError("Could not reach the provider");
  }
  if (!res.ok) throw new ModelListError(`The provider answered ${res.status} listing models`);
  const json: unknown = await res.json().catch(() => null);
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new ModelListError("The provider returned no model list");
  const ids = data.flatMap((item: { id?: unknown }) =>
    typeof item?.id === "string" ? [item.id] : [],
  );
  return [...new Set(ids)].sort();
}

// A provider's models that can drive the agent (see `model-catalog.ts`).
export async function listAgentModels(source: ModelSource, fetchFn?: typeof fetch) {
  const ids = await fetchModels(source, fetchFn);
  return modelCatalog.chatModels(source.kind as ModelConfig["provider"], ids);
}

// What the API returns: never the key itself, only a hint.
export type ProviderView = Omit<ProviderRow, "apiKeyEncrypted" | "userId"> & { hasKey: boolean };

function view(row: ProviderRow): ProviderView {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    baseUrl: row.baseUrl,
    modelId: row.modelId,
    keyHint: row.keyHint,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hasKey: row.apiKeyEncrypted !== null,
  };
}

const hint = (apiKey: string) => apiKey.slice(-4);

export const providersService = {
  async list(userId: string) {
    const rows = await db
      .select()
      .from(providers)
      .where(eq(providers.userId, userId))
      .orderBy(asc(providers.createdAt));
    return rows.map(view);
  },

  async create(userId: string, body: CreateProviderBody) {
    return db.transaction(async (tx) => {
      // The first provider a user adds becomes their default.
      const existing = await tx
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.userId, userId))
        .limit(1);
      const isDefault = body.isDefault ?? existing.length === 0;
      if (isDefault) {
        await tx
          .update(providers)
          .set({ isDefault: false })
          .where(and(eq(providers.userId, userId), eq(providers.isDefault, true)));
      }
      const [row] = await tx
        .insert(providers)
        .values({
          userId,
          kind: body.kind,
          name: body.name,
          baseUrl: body.kind === "openai-compatible" ? body.baseUrl : null,
          modelId: body.modelId ?? null,
          apiKeyEncrypted: body.apiKey ? encryptSecret(body.apiKey) : null,
          keyHint: body.apiKey ? hint(body.apiKey) : null,
          isDefault,
        })
        .returning();
      return view(row!);
    });
  },

  async update(userId: string, id: string, body: UpdateProviderBody) {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(providers)
        .where(and(eq(providers.id, id), eq(providers.userId, userId)));
      if (!current) return null;
      if (body.baseUrl !== undefined && current.kind !== "openai-compatible") {
        throw new InvalidProviderError("Only OpenAI-compatible providers have a base URL");
      }
      if (body.modelId === null && current.kind === "openai-compatible") {
        throw new InvalidProviderError("An OpenAI-compatible provider needs a model id");
      }
      if (body.isDefault === true) {
        await tx
          .update(providers)
          .set({ isDefault: false })
          .where(and(eq(providers.userId, userId), eq(providers.isDefault, true)));
      }
      const [row] = await tx
        .update(providers)
        .set({
          name: body.name,
          baseUrl: body.baseUrl,
          modelId: body.modelId,
          isDefault: body.isDefault,
          apiKeyEncrypted: body.apiKey ? encryptSecret(body.apiKey) : undefined,
          keyHint: body.apiKey ? hint(body.apiKey) : undefined,
        })
        .where(eq(providers.id, id))
        .returning();
      return view(row!);
    });
  },

  async remove(userId: string, id: string) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .delete(providers)
        .where(and(eq(providers.id, id), eq(providers.userId, userId)))
        .returning({ isDefault: providers.isDefault });
      if (!row) return false;
      // Deleting the default hands the role to the oldest remaining provider.
      if (row.isDefault) {
        const [next] = await tx
          .select({ id: providers.id })
          .from(providers)
          .where(eq(providers.userId, userId))
          .orderBy(asc(providers.createdAt))
          .limit(1);
        if (next)
          await tx.update(providers).set({ isDefault: true }).where(eq(providers.id, next.id));
      }
      return true;
    });
  },

  // Lists models using a saved provider's own stored key.
  async listModels(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(providers)
      .where(and(eq(providers.id, id), eq(providers.userId, userId)));
    if (!row) return null;
    const models = await listAgentModels({
      kind: row.kind,
      baseUrl: row.baseUrl ?? undefined,
      apiKey: row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted) : undefined,
    });
    return { models, efforts: await effortsByModel(row.kind as ModelConfig["provider"], models) };
  },

  // The model configuration for a run: the provider the message chose (it must be the user's own)
  // or else their default, or null if they have neither. Decrypts the key, so call it only where
  // a run is being started. Throws InvalidSelectionError for a choice that cannot run.
  async resolveModel(userId: string, selection: ModelSelection = {}): Promise<ModelConfig | null> {
    const [row] = await db
      .select()
      .from(providers)
      .where(
        selection.providerId
          ? and(eq(providers.id, selection.providerId), eq(providers.userId, userId))
          : and(eq(providers.userId, userId), eq(providers.isDefault, true)),
      );
    if (!row) {
      if (selection.providerId) throw new InvalidSelectionError("Provider not found");
      if (selection.modelId || selection.reasoningEffort) {
        throw new InvalidSelectionError("Add a provider to choose a model");
      }
      return null;
    }
    const config: ModelConfig = {
      provider: row.kind as ModelConfig["provider"],
      modelId: selection.modelId ?? row.modelId ?? undefined,
      baseUrl: row.baseUrl ?? undefined,
      apiKey: row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted) : undefined,
    };
    if (selection.modelId && !(await modelCatalog.canRun(config.provider, selection.modelId))) {
      throw new InvalidSelectionError(`${selection.modelId} cannot be used to run the agent`);
    }
    if (selection.reasoningEffort) {
      const { controls, effortLevels } = await effortsFor(config.provider, config.modelId);
      if (!controls?.options.includes(selection.reasoningEffort)) {
        throw new InvalidSelectionError(
          `This model does not support the "${selection.reasoningEffort}" reasoning effort`,
        );
      }
      config.reasoningEffort = selection.reasoningEffort;
      config.effortLevels = effortLevels;
    }
    return config;
  },
};
