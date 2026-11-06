import { db } from "@aven/db/client";
import { providers, type ProviderRow } from "@aven/db/schema/providers";
import type { ModelConfig } from "@aven/agents/model";
import { providerNeedsKey } from "@aven/protocol/providers";
import { and, asc, eq } from "drizzle-orm";

import { UnprocessableError } from "../../errors";
import { encryptSecret } from "../../crypto";
import { readKey } from "./crypto";
import { effortsByModel, listAgentModels, ModelListError, type ModelSource } from "./model-list";
import {
  azureEndpoint,
  type CreateProviderBody,
  type KeylessProviderBody,
  type UpdateProviderBody,
} from "./schema";

class InvalidProviderError extends UnprocessableError {}

type ProviderKind = ModelConfig["provider"];

// The vendors have one credential each; only an OpenAI-compatible server can be added many times,
// since every server is its own.
const SINGLE_CREDENTIAL = new Set<ProviderKind>(["openai", "anthropic", "gemini", "azure"]);

const hasBaseUrl = (kind: ProviderKind): kind is "azure" | "openai-compatible" =>
  kind === "openai-compatible" || kind === "azure";

// What the API returns: never the key itself, only a hint.
export type ProviderView = Omit<ProviderRow, "apiKeyEncrypted" | "userId"> & { hasKey: boolean };

function view({ apiKeyEncrypted, userId: _userId, ...row }: ProviderRow): ProviderView {
  return { ...row, hasKey: apiKeyEncrypted !== null };
}

// A changed Azure resource URL is held to the same rules as a new one.
function azureEndpointOf(value: string) {
  const parsed = azureEndpoint.safeParse(value);
  if (!parsed.success) throw new InvalidProviderError("An Azure resource URL must be https");
  return parsed.data;
}

const hint = (apiKey: string) => apiKey.slice(-4);

// The stored form of an API key; empty when there is none to set, which leaves a stored one alone.
const secretColumns = (apiKey: string | undefined) =>
  apiKey ? { apiKeyEncrypted: encryptSecret(apiKey), keyHint: hint(apiKey) } : {};

// What an update does to the key: a new one replaces it, forgetting it clears it, else it stays.
function keyColumns(apiKey: string | undefined, dropKey: boolean) {
  if (apiKey) return secretColumns(apiKey);
  if (dropKey) return { apiKeyEncrypted: null, keyHint: null };
  return {};
}

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

  // A provider with no key, which a bot asks for (decision 0086), cannot run, so it is not made the
  // default: the person gives its key first.
  async create(userId: string, body: CreateProviderBody | KeylessProviderBody) {
    return db.transaction(async (tx) => {
      // The first provider a user adds becomes their default.
      const existing = await tx
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.userId, userId))
        .limit(1);
      if (SINGLE_CREDENTIAL.has(body.kind)) {
        const [same] = await tx
          .select({ id: providers.id })
          .from(providers)
          .where(and(eq(providers.userId, userId), eq(providers.kind, body.kind)))
          .limit(1);
        if (same)
          throw new InvalidProviderError("This provider is already connected; remove it first");
      }
      const cannotRun = providerNeedsKey(body.kind) && !body.apiKey;
      const isDefault = !cannotRun && (body.isDefault ?? existing.length === 0);
      if (isDefault) await clearDefault(tx, userId);
      const [row] = await tx
        .insert(providers)
        .values({
          userId,
          kind: body.kind,
          name: body.name,
          baseUrl: body.kind === "openai-compatible" || body.kind === "azure" ? body.baseUrl : null,
          modelId: body.modelId ?? null,
          ...secretColumns(body.apiKey),
          isDefault,
        })
        .returning();
      return view(row!);
    });
  },

  // `dropKey` forgets the saved key: a bot that moves a provider to another address must not send the
  // person's key there (decision 0086), so the person gives it again.
  async update(
    userId: string,
    id: string,
    body: UpdateProviderBody,
    { dropKey = false }: { dropKey?: boolean } = {},
  ) {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(providers).where(ownProvider(userId, id));
      if (!current) return null;
      if (body.baseUrl !== undefined && !hasBaseUrl(current.kind)) {
        throw new InvalidProviderError(
          "Only Azure and OpenAI-compatible providers have a base URL",
        );
      }
      if (body.modelId === null && hasBaseUrl(current.kind)) {
        throw new InvalidProviderError("This provider needs a model id");
      }
      const baseUrl =
        body.baseUrl !== undefined && current.kind === "azure"
          ? azureEndpointOf(body.baseUrl)
          : body.baseUrl;
      const keyed = body.apiKey !== undefined || (current.apiKeyEncrypted !== null && !dropKey);
      if (body.isDefault === true) {
        if (providerNeedsKey(current.kind) && !keyed) {
          throw new InvalidProviderError("Add this provider's key before making it the default");
        }
        await clearDefault(tx, userId);
      }
      const [row] = await tx
        .update(providers)
        .set({
          name: body.name,
          baseUrl,
          modelId: body.modelId,
          isDefault: body.isDefault,
          ...keyColumns(body.apiKey, dropKey),
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
    const source = sourceOf(row);
    const models = await modelsOf(row, source);
    return { models, efforts: await effortsByModel(source, models) };
  },

  // The provider a run uses: the one chosen, which must be the user's own, or else their default.
  // The row holds the encrypted key.
  async forRun(userId: string, providerId: string | undefined) {
    const [row] = await db
      .select()
      .from(providers)
      .where(
        providerId
          ? ownProvider(userId, providerId)
          : and(eq(providers.userId, userId), eq(providers.isDefault, true)),
      );
    return row;
  },
};

// Where a saved provider's models are asked for, with its own stored key.
const sourceOf = (row: ProviderRow): ModelSource => ({
  kind: row.kind,
  baseUrl: row.baseUrl ?? undefined,
  apiKey: readKey(row),
});

// The models a saved provider offers: its listing. For Azure, the deployments of the resource, with
// the one it was set up with first; that one stays on offer if the listing fails.
async function modelsOf(row: ProviderRow, source: ModelSource) {
  if (row.kind !== "azure") return listAgentModels(source);
  const listed = await listAgentModels(source).catch((error) => {
    if (error instanceof ModelListError) return [];
    throw error;
  });
  return [...new Set([row.modelId ?? "", ...listed])].filter(Boolean);
}
