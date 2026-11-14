import { db } from "@aven/db/client";
import { providers } from "@aven/db/schema/providers";
import { providerNeedsKey } from "@aven/protocol/providers";
import { and, asc, eq } from "drizzle-orm";

import { UnprocessableError } from "@aven/server-kit/errors";
import { encryptSecret } from "@aven/server-kit/crypto";
import { readKey } from "./crypto";
import { isGoogleCredential, parseServiceAccount } from "./google-auth";
import { effortsByModel, labelsByModel, listAgentModels, ModelListError } from "./model-list";
import {
  azureEndpoint,
  bedrockEndpoint,
  vertexEndpoint,
  type CreateProviderBody,
  type KeylessProviderBody,
  type UpdateProviderBody,
} from "./schema";
import type { ModelSource, ProviderView } from "./types";
import type { ModelConfig } from "@aven/agents/types";
import type { ProviderRow } from "@aven/db/schema/types";

class InvalidProviderError extends UnprocessableError {}

type ProviderKind = ModelConfig["provider"];

const SINGLE_CREDENTIAL = new Set<ProviderKind>(["openai", "anthropic", "gemini", "azure"]);

const hasBaseUrl = (
  kind: ProviderKind,
): kind is "azure" | "bedrock" | "vertex" | "openai-compatible" =>
  kind === "openai-compatible" || kind === "azure" || kind === "bedrock" || kind === "vertex";

function view({ apiKeyEncrypted, userId: _userId, ...row }: ProviderRow): ProviderView {
  return { ...row, hasKey: apiKeyEncrypted !== null };
}

function azureEndpointOf(value: string) {
  const parsed = azureEndpoint.safeParse(value);

  if (!parsed.success) throw new InvalidProviderError("An Azure resource URL must be https");

  return parsed.data;
}

function bedrockEndpointOf(value: string) {
  const parsed = bedrockEndpoint.safeParse(value);

  if (!parsed.success) throw new InvalidProviderError(parsed.error.issues[0]!.message);

  return parsed.data;
}

function vertexEndpointOf(value: string) {
  const parsed = vertexEndpoint.safeParse(value);

  if (!parsed.success) throw new InvalidProviderError(parsed.error.issues[0]!.message);

  return parsed.data;
}

function changedBaseUrl(kind: ProviderKind, baseUrl: string | undefined) {
  if (baseUrl === undefined) return undefined;

  if (kind === "azure") return azureEndpointOf(baseUrl);

  if (kind === "bedrock") return bedrockEndpointOf(baseUrl);

  if (kind === "vertex") return vertexEndpointOf(baseUrl);

  return baseUrl;
}

function hint(apiKey: string) {
  const account = parseServiceAccount(apiKey);
  return account ? (account.private_key_id ?? "json").slice(-4) : apiKey.slice(-4);
}

const secretColumns = (apiKey: string | undefined) =>
  apiKey ? { apiKeyEncrypted: encryptSecret(apiKey), keyHint: hint(apiKey) } : {};

function keyColumns(apiKey: string | undefined, dropKey: boolean) {
  if (apiKey) return secretColumns(apiKey);

  if (dropKey) return { apiKeyEncrypted: null, keyHint: null };

  return {};
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

  async create(userId: string, body: CreateProviderBody | KeylessProviderBody) {
    return db.transaction(async (tx) => {
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
          baseUrl: hasBaseUrl(body.kind) && "baseUrl" in body ? body.baseUrl : null,
          modelId: body.modelId ?? null,
          ...secretColumns(body.apiKey),
          isDefault,
        })
        .returning();
      return view(row!);
    });
  },

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
          "Only Azure, Bedrock, Vertex AI and OpenAI-compatible providers have a base URL",
        );
      }

      if (body.modelId === null && hasBaseUrl(current.kind)) {
        throw new InvalidProviderError("This provider needs a model id");
      }

      const baseUrl = changedBaseUrl(current.kind, body.baseUrl);

      if (body.apiKey !== undefined && current.kind !== "vertex" && body.apiKey.length > 500) {
        throw new InvalidProviderError("An API key is at most 500 characters");
      }

      if (
        body.apiKey !== undefined &&
        current.kind === "vertex" &&
        !isGoogleCredential(body.apiKey)
      ) {
        throw new InvalidProviderError("Give a service account's JSON key, or an access token");
      }

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

  async listModels(userId: string, id: string) {
    const [row] = await db.select().from(providers).where(ownProvider(userId, id));

    if (!row) return null;

    const source = sourceOf(row);
    const models = await modelsOf(row, source);
    const [efforts, labels] = await Promise.all([
      effortsByModel(source, models),
      labelsByModel(source, models),
    ]);
    return { models, efforts, labels };
  },

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

const sourceOf = (row: ProviderRow): ModelSource => ({
  kind: row.kind,
  baseUrl: row.baseUrl ?? undefined,
  apiKey: readKey(row),
});

async function modelsOf(row: ProviderRow, source: ModelSource) {
  if (row.kind !== "azure" && row.kind !== "vertex") return listAgentModels(source);

  const listed = await listAgentModels(source).catch((error) => {
    if (error instanceof ModelListError) return [];

    throw error;
  });
  return [...new Set([row.modelId ?? "", ...listed])].filter(Boolean);
}
