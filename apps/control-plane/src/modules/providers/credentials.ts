import type { ProviderRow } from "@aven/db/schema/types";
import { parseCodexAuth } from "@aven/protocol/codex-auth";
import { providerBackend } from "@aven/protocol/providers";
import type { Provider } from "@aven/protocol/types";
import { encryptSecret } from "@aven/server-kit/crypto";
import { UnprocessableError } from "@aven/server-kit/errors";

import type { GrantedProvider } from "../../edition/types";
import { HOSTED_BACKENDS } from "./backends";
import { parseServiceAccount } from "./google-auth";
import { azureEndpoint, bedrockEndpoint, credentialFor, vertexEndpoint } from "./schema";
import type { ProviderView, RunnableProvider } from "./types";

export class InvalidProviderError extends UnprocessableError {}

export const SINGLE_CREDENTIAL = new Set<Provider>([
  "openai",
  "anthropic",
  "gemini",
  "azure",
  "claude-subscription",
  "codex-subscription",
]);

export const hasBaseUrl = (
  kind: Provider,
): kind is "azure" | "bedrock" | "vertex" | "openai-compatible" =>
  kind === "openai-compatible" || kind === "azure" || kind === "bedrock" || kind === "vertex";

export function providerView({
  apiKeyEncrypted,
  keyDigest: _keyDigest,
  userId: _userId,
  ...row
}: ProviderRow): ProviderView {
  return { ...row, hasKey: apiKeyEncrypted !== null, backend: providerBackend(row.kind) };
}

export function grantedProviderView(granted: GrantedProvider): ProviderView {
  return {
    id: granted.id,
    kind: granted.kind,
    name: granted.name,
    baseUrl: granted.baseUrl,
    modelId: granted.modelId,
    keyHint: granted.keyHint,
    isDefault: false,
    createdAt: granted.createdAt,
    updatedAt: granted.createdAt,
    hasKey: granted.apiKeyEncrypted !== null,
    backend: providerBackend(granted.kind),
    managed: true,
  };
}

export function grantedToRow(userId: string, granted: GrantedProvider): RunnableProvider {
  return {
    id: granted.id,
    userId,
    kind: granted.kind,
    name: granted.name,
    baseUrl: granted.baseUrl,
    modelId: granted.modelId,
    apiKeyEncrypted: granted.apiKeyEncrypted,
    keyHint: granted.keyHint,
    keyDigest: null,
    isDefault: false,
    createdAt: granted.createdAt,
    updatedAt: granted.createdAt,
    allowedModels: granted.allowedModels,
  };
}

export function filterAllowedModels<E>(
  catalog: { models: string[]; labels: Record<string, string>; efforts: Record<string, E> },
  allowed: string[] | null,
) {
  if (!allowed || allowed.length === 0) return catalog;

  const set = new Set(allowed);
  const models = catalog.models.filter((model) => set.has(model));
  const labels: Record<string, string> = {};
  const efforts: Record<string, E> = {};

  for (const model of models) {
    if (catalog.labels[model]) labels[model] = catalog.labels[model];

    if (catalog.efforts[model]) efforts[model] = catalog.efforts[model];
  }

  return { models, labels, efforts };
}

export function assertProviderOffered(kind: Provider) {
  const hosted = HOSTED_BACKENDS.find((candidate) => candidate.kind === kind);

  if (hosted && !hosted.offered()) throw new InvalidProviderError(hosted.off);
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

export function checkProviderCredential(kind: Provider, apiKey: string) {
  if (kind !== "vertex" && apiKey.length > 4096)
    throw new InvalidProviderError("An API key is at most 4096 characters");

  const parsed = credentialFor(kind).safeParse(apiKey);

  if (!parsed.success)
    throw new InvalidProviderError(parsed.error.issues[0]?.message ?? "That is not a usable key");
}

export function changedBaseUrl(kind: Provider, baseUrl: string | undefined) {
  if (baseUrl === undefined) return undefined;

  if (kind === "azure") return azureEndpointOf(baseUrl);

  if (kind === "bedrock") return bedrockEndpointOf(baseUrl);

  if (kind === "vertex") return vertexEndpointOf(baseUrl);

  return baseUrl;
}

function hint(apiKey: string) {
  const codex = parseCodexAuth(apiKey);

  if (codex) return codex.tokens.refresh_token.slice(-4);

  const account = parseServiceAccount(apiKey);
  return account ? (account.private_key_id ?? "json").slice(-4) : apiKey.slice(-4);
}

export const refreshDigest = (refreshToken: string) =>
  new Bun.CryptoHasher("sha256").update(refreshToken).digest("hex");

function digestOf(apiKey: string) {
  const codex = parseCodexAuth(apiKey);
  return codex ? refreshDigest(codex.tokens.refresh_token) : null;
}

export const secretColumns = (apiKey: string | undefined) =>
  apiKey
    ? { apiKeyEncrypted: encryptSecret(apiKey), keyHint: hint(apiKey), keyDigest: digestOf(apiKey) }
    : {};

export function keyColumns(apiKey: string | undefined, dropKey: boolean) {
  if (apiKey) return secretColumns(apiKey);

  if (dropKey) return { apiKeyEncrypted: null, keyHint: null, keyDigest: null };

  return {};
}
