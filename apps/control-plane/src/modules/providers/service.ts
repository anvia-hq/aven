import { db } from "@aven/db/client";
import { providers, type ProviderRow } from "@aven/db/schema/providers";
import { reasoningControlsFor, type ModelConfig, type ReasoningControls } from "@aven/agents/model";
import { and, asc, eq } from "drizzle-orm";

import { UnavailableError, UnprocessableError } from "../../errors";
import { decryptSecret, encryptSecret } from "./crypto";
import { modelCatalog } from "./model-catalog";
import type { CreateProviderBody, UpdateProviderBody } from "./schema";

export class InvalidProviderError extends UnprocessableError {}
export class ModelListError extends UnprocessableError {}
// A message asked for a provider, model or effort the user cannot run with.
export class InvalidSelectionError extends UnprocessableError {}

type ProviderKind = ModelConfig["provider"];

// What a message may choose beyond the user's default: one of their own providers, a model of it
// and a reasoning effort that model supports.
export type ModelSelection = { providerId?: string; modelId?: string; reasoningEffort?: string };

// A model's effort levels: the SDK's own list, or for a model newer than the SDK the one models.dev
// lists (`effortLevels`, which the model must then be built with for the SDK to accept it).
async function effortsFor(kind: ProviderKind, modelId: string | undefined) {
  const sdk = reasoningControlsFor({ provider: kind, modelId });
  if (sdk || !modelId) return { controls: sdk, effortLevels: undefined };
  const effortLevels = (await modelCatalog.efforts(kind, modelId)) ?? undefined;
  return {
    controls: reasoningControlsFor({ provider: kind, modelId, effortLevels }),
    effortLevels,
  };
}

// The effort levels of each listed model that has any; models without the control are left out.
export async function effortsByModel(kind: ProviderKind, ids: string[]) {
  const entries = await Promise.all(
    ids.map(async (id) => [id, (await effortsFor(kind, id)).controls] as const),
  );
  return Object.fromEntries(entries.filter(([, controls]) => controls)) as Record<
    string,
    ReasoningControls
  >;
}

type ModelSource = { kind: ProviderKind; apiKey?: string; baseUrl?: string };

function requireApiKey({ apiKey }: ModelSource) {
  if (!apiKey) throw new ModelListError("An API key is needed to list models");
  return apiKey;
}

// Where a provider's model list is and how to ask for it.
function modelsRequest(source: ModelSource) {
  if (source.kind === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/models?limit=1000",
      headers: { "x-api-key": requireApiKey(source), "anthropic-version": "2023-06-01" },
    };
  }
  const headers: Record<string, string> = {};
  if (source.apiKey) headers.authorization = `Bearer ${source.apiKey}`;
  if (source.kind === "openai") {
    requireApiKey(source);
    return { url: "https://api.openai.com/v1/models", headers };
  }
  if (!source.baseUrl) throw new ModelListError("A base URL is needed to list models");
  return { url: `${source.baseUrl.replace(/\/+$/, "")}/models`, headers };
}

function parseModelIds(json: unknown) {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new ModelListError("The provider returned no model list");
  const ids = data.flatMap((item: { id?: unknown }) =>
    typeof item?.id === "string" ? [item.id] : [],
  );
  return [...new Set(ids)].sort();
}

// Asks the provider itself which models the key can use (`GET <base>/models`). `fetchFn` is
// injectable so tests never hit the network.
export async function fetchModels(source: ModelSource, fetchFn: typeof fetch = fetch) {
  const { url, headers } = modelsRequest(source);
  let res: Response;
  try {
    res = await fetchFn(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ModelListError("Could not reach the provider");
  }
  if (!res.ok) throw new ModelListError(`The provider answered ${res.status} listing models`);
  return parseModelIds(await res.json().catch(() => null));
}

// A provider's models that can drive the agent (see `model-catalog.ts`).
export async function listAgentModels(source: ModelSource, fetchFn?: typeof fetch) {
  const ids = await fetchModels(source, fetchFn);
  return modelCatalog.chatModels(source.kind, ids);
}

// What the API returns: never the key itself, only a hint.
export type ProviderView = Omit<ProviderRow, "apiKeyEncrypted" | "userId"> & { hasKey: boolean };

function view({ apiKeyEncrypted, userId: _userId, ...row }: ProviderRow): ProviderView {
  return { ...row, hasKey: apiKeyEncrypted !== null };
}

const hint = (apiKey: string) => apiKey.slice(-4);

// The stored form of an API key; empty when there is none to set, which leaves a stored one alone.
const secretColumns = (apiKey: string | undefined) =>
  apiKey ? { apiKeyEncrypted: encryptSecret(apiKey), keyHint: hint(apiKey) } : {};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// A user has at most one default provider; call this before making another one the default.
const clearDefault = (tx: Tx, userId: string) =>
  tx
    .update(providers)
    .set({ isDefault: false })
    .where(and(eq(providers.userId, userId), eq(providers.isDefault, true)));

const ownProvider = (userId: string, id: string) =>
  and(eq(providers.id, id), eq(providers.userId, userId));

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
      if (isDefault) await clearDefault(tx, userId);
      const [row] = await tx
        .insert(providers)
        .values({
          userId,
          kind: body.kind,
          name: body.name,
          baseUrl: body.kind === "openai-compatible" ? body.baseUrl : null,
          modelId: body.modelId ?? null,
          ...secretColumns(body.apiKey),
          isDefault,
        })
        .returning();
      return view(row!);
    });
  },

  async update(userId: string, id: string, body: UpdateProviderBody) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(providers).where(ownProvider(userId, id));
      if (!current) return null;
      if (body.baseUrl !== undefined && current.kind !== "openai-compatible") {
        throw new InvalidProviderError("Only OpenAI-compatible providers have a base URL");
      }
      if (body.modelId === null && current.kind === "openai-compatible") {
        throw new InvalidProviderError("An OpenAI-compatible provider needs a model id");
      }
      if (body.isDefault === true) await clearDefault(tx, userId);
      const [row] = await tx
        .update(providers)
        .set({
          name: body.name,
          baseUrl: body.baseUrl,
          modelId: body.modelId,
          isDefault: body.isDefault,
          ...secretColumns(body.apiKey),
        })
        .where(ownProvider(userId, id))
        .returning();
      return view(row!);
    });
  },

  async remove(userId: string, id: string) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .delete(providers)
        .where(ownProvider(userId, id))
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
    const [row] = await db.select().from(providers).where(ownProvider(userId, id));
    if (!row) return null;
    const models = await listAgentModels({
      kind: row.kind,
      baseUrl: row.baseUrl ?? undefined,
      apiKey: readKey(row),
    });
    return { models, efforts: await effortsByModel(row.kind, models) };
  },

  // The model configuration for a run: the provider the message chose (it must be the user's own)
  // or else their default, or null if they have neither. Decrypts the key, so call it only where
  // a run is being started. Throws InvalidSelectionError for a choice that cannot run.
  async resolveModel(userId: string, selection: ModelSelection = {}): Promise<ModelConfig | null> {
    const row = await findSelectedProvider(userId, selection);
    if (!row) return noProvider(selection);
    const config: ModelConfig = {
      provider: row.kind,
      modelId: selection.modelId ?? row.modelId ?? undefined,
      baseUrl: row.baseUrl ?? undefined,
      apiKey: readKey(row),
    };
    if (selection.modelId) await assertRunnable(config.provider, selection.modelId);
    if (selection.reasoningEffort) await applyEffort(config, selection.reasoningEffort);
    return config;
  },
};

// A key that cannot be decrypted (a rotated PROVIDER_ENCRYPTION_KEY, a damaged row) is an
// unavailable provider, not a server bug: the owner fixes it by entering the key again.
function readKey(row: ProviderRow) {
  if (!row.apiKeyEncrypted) return undefined;
  try {
    return decryptSecret(row.apiKeyEncrypted);
  } catch (error) {
    console.error(`Could not decrypt the key of provider ${row.id}:`, error);
    throw new UnavailableError("This provider's saved key could not be read; enter it again");
  }
}

async function findSelectedProvider(userId: string, selection: ModelSelection) {
  const [row] = await db
    .select()
    .from(providers)
    .where(
      selection.providerId
        ? ownProvider(userId, selection.providerId)
        : and(eq(providers.userId, userId), eq(providers.isDefault, true)),
    );
  return row;
}

// With no provider found, a message that chose nothing runs on the environment's.
function noProvider(selection: ModelSelection) {
  if (selection.providerId) throw new InvalidSelectionError("Provider not found");
  if (selection.modelId || selection.reasoningEffort) {
    throw new InvalidSelectionError("Add a provider to choose a model");
  }
  return null;
}

async function assertRunnable(kind: ProviderKind, modelId: string) {
  if (!(await modelCatalog.canRun(kind, modelId))) {
    throw new InvalidSelectionError(`${modelId} cannot be used to run the agent`);
  }
}

async function applyEffort(config: ModelConfig, reasoningEffort: string) {
  const { controls, effortLevels } = await effortsFor(config.provider, config.modelId);
  if (!controls?.options.includes(reasoningEffort)) {
    throw new InvalidSelectionError(
      `This model does not support the "${reasoningEffort}" reasoning effort`,
    );
  }
  config.reasoningEffort = reasoningEffort;
  config.effortLevels = effortLevels;
}
