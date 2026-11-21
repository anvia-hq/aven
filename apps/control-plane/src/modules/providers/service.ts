import { parseCodexAuth } from "@aven/protocol/codex-auth";
import { db } from "@aven/db/client";
import { bots } from "@aven/db/schema/bots";
import { providers } from "@aven/db/schema/providers";
import { threads } from "@aven/db/schema/threads";
import { isModelApi, providerNeedsKey } from "@aven/protocol/providers";
import { MODEL_APIS } from "@aven/protocol/runtime-wire";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { editionInUse } from "../../edition/current";
import { hostedKindOf } from "./backends";
import {
  assertProviderOffered,
  changedBaseUrl,
  checkProviderCredential,
  filterAllowedModels,
  grantedProviderView,
  grantedToRow,
  hasBaseUrl,
  InvalidProviderError,
  keyColumns,
  providerView,
  refreshDigest,
  secretColumns,
  SINGLE_CREDENTIAL,
} from "./credentials";
import { readKey } from "./crypto";
import { effortsByModel, labelsByModel, listAgentModels, ModelListError } from "./model-list";
import { subscriptionCatalog } from "./subscription-models";
import type { CreateProviderBody, KeylessProviderBody, UpdateProviderBody } from "./schema";
import type { ModelSource, ProviderCatalog, RunnableProvider } from "./types";
import type { Provider } from "@aven/protocol/types";
import type { ProviderRow } from "@aven/db/schema/types";

export { refreshDigest };

export function listedModels(kind: Provider): ProviderCatalog | undefined {
  return subscriptionCatalog(kind);
}

export const invalidBotModel = (message: string) => new InvalidProviderError(message);

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
    const [rows, granted] = await Promise.all([
      db
        .select()
        .from(providers)
        .where(eq(providers.userId, userId))
        .orderBy(asc(providers.createdAt)),
      editionInUse.current.providers?.list(userId) ?? Promise.resolve([]),
    ]);
    return [...rows.map(providerView), ...granted.map(grantedProviderView)];
  },

  async create(userId: string, body: CreateProviderBody | KeylessProviderBody) {
    assertProviderOffered(body.kind);

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
      return providerView(row!);
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

      if (body.apiKey !== undefined) checkProviderCredential(current.kind, body.apiKey);

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
      return providerView(row!);
    });
  },

  async remove(userId: string, id: string) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .delete(providers)
        .where(ownProvider(userId, id))
        .returning({ isDefault: providers.isDefault });

      if (!row) return false;

      await tx
        .update(threads)
        .set({ modelProviderId: null })
        .where(eq(threads.modelProviderId, id));
      await tx.update(bots).set({ providerId: null }).where(eq(bots.providerId, id));

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
    const [own] = await db.select().from(providers).where(ownProvider(userId, id));
    const granted = own ? null : ((await editionInUse.current.providers?.find(userId, id)) ?? null);
    const row = own ?? (granted ? grantedToRow(userId, granted) : null);

    if (!row) return null;

    const allowed = granted?.allowedModels ?? null;
    const catalog = subscriptionCatalog(row.kind);

    if (catalog) return filterAllowedModels(catalog, allowed);

    const source = sourceOf(row);
    const models = await modelsOf(row, source);
    const [efforts, labels] = await Promise.all([
      effortsByModel(source, models),
      labelsByModel(source, models),
    ]);
    return filterAllowedModels({ models, efforts, labels }, allowed);
  },

  async rowForBackend(userId: string, backend: string) {
    const kind = hostedKindOf(backend as Parameters<typeof hostedKindOf>[0]);

    if (!kind) return undefined;

    const [row] = await db
      .select()
      .from(providers)
      .where(and(eq(providers.userId, userId), eq(providers.kind, kind)))
      .limit(1);

    return row;
  },

  async renewCodexAuth(previous: string, token: string) {
    const before = parseCodexAuth(previous);
    const after = parseCodexAuth(token);

    if (!before || !after) return false;

    if ((before.tokens.account_id ?? null) !== (after.tokens.account_id ?? null)) return false;

    const [row] = await db
      .select()
      .from(providers)
      .where(
        and(
          eq(providers.kind, "codex-subscription"),
          eq(providers.keyDigest, refreshDigest(before.tokens.refresh_token)),
        ),
      )
      .limit(1);

    if (!row?.apiKeyEncrypted) return false;

    const updated = await db
      .update(providers)
      .set(secretColumns(token.trim()))
      .where(and(eq(providers.id, row.id), eq(providers.apiKeyEncrypted, row.apiKeyEncrypted)))
      .returning({ id: providers.id });

    return updated.length > 0;
  },

  async tokenFor(userId: string, backend: string) {
    const row = await this.rowForBackend(userId, backend);

    if (!row) return undefined;

    return readKey(row);
  },

  async forNativeRun(
    userId: string,
    providerId: string | undefined,
  ): Promise<RunnableProvider | undefined> {
    if (providerId) return this.forRun(userId, providerId);

    const [row] = await db
      .select()
      .from(providers)
      .where(and(eq(providers.userId, userId), inArray(providers.kind, [...MODEL_APIS])))
      .orderBy(desc(providers.isDefault), asc(providers.createdAt))
      .limit(1);

    if (row) return row;

    const granted = (await editionInUse.current.providers?.list(userId)) ?? [];
    const native = granted.find((item) => isModelApi(item.kind));

    return native ? grantedToRow(userId, native) : undefined;
  },

  async forRun(
    userId: string,
    providerId: string | undefined,
  ): Promise<RunnableProvider | undefined> {
    const [row] = await db
      .select()
      .from(providers)
      .where(
        providerId
          ? ownProvider(userId, providerId)
          : and(eq(providers.userId, userId), eq(providers.isDefault, true)),
      );

    if (row) return row;

    if (providerId) {
      const granted = await editionInUse.current.providers?.find(userId, providerId);

      return granted ? grantedToRow(userId, granted) : undefined;
    }

    const granted = (await editionInUse.current.providers?.list(userId)) ?? [];

    return granted[0] ? grantedToRow(userId, granted[0]) : undefined;
  },
};

const sourceOf = (row: ProviderRow): ModelSource => {
  if (!isModelApi(row.kind))
    throw new InvalidProviderError("A subscription has no models of its own to list here");

  return { kind: row.kind, baseUrl: row.baseUrl ?? undefined, apiKey: readKey(row) };
};

async function modelsOf(row: ProviderRow, source: ModelSource) {
  if (row.kind !== "azure" && row.kind !== "vertex") return listAgentModels(source);

  const listed = await listAgentModels(source).catch((error) => {
    if (error instanceof ModelListError) return [];

    throw error;
  });
  return [...new Set([row.modelId ?? "", ...listed])].filter(Boolean);
}
