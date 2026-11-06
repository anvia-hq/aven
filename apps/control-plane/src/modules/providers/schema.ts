import { BEDROCK_ENDPOINT, vertexPartsOf } from "@aven/protocol/providers";
import { PROVIDERS } from "@aven/protocol/runtime-wire";
import { z } from "zod";

import { isGoogleCredential } from "./google-auth";

export const providerParams = z.object({ id: z.uuid() });

export const providerName = z.string().trim().min(1).max(100);
export const providerModelId = z.string().trim().min(1).max(200);
const apiKey = z.string().trim().min(1).max(500);
export const providerBaseUrl = z
  .url({ protocol: /^https?$/ })
  .max(500)
  .transform((value) => value.replace(/\/+$/, ""));

// An Azure OpenAI resource is addressed by its origin, e.g. https://my-resource.openai.azure.com.
// The control plane calls it with the user's key, so it must be HTTPS; any path is dropped.
export const azureEndpoint = z
  .url({ protocol: /^https$/ })
  .max(500)
  .transform((value) => new URL(value).origin);

// Amazon Bedrock is addressed by its regional endpoint, `https://bedrock-mantle.<region>.api.aws/v1`
// (`bedrockBaseUrl`). The control plane calls it with the user's key, so it must be exactly AWS's host.
export const bedrockEndpoint = z
  .string()
  .trim()
  .max(500)
  .regex(BEDROCK_ENDPOINT, "A Bedrock endpoint is https://bedrock-mantle.<region>.api.aws/v1")
  .transform((value) => value.replace(/\/+$/, ""));

// Vertex AI is addressed by a project and a location (`vertexBaseUrl`); the key goes only to Google's
// own host, whose region is the path's. Its credential is a service account's JSON key or an access token.
export const vertexEndpoint = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => vertexPartsOf(value) !== null,
    "A Vertex AI endpoint is https://<location>-aiplatform.googleapis.com/v1/projects/<project>/locations/<location>/endpoints/openapi (aiplatform.googleapis.com for global)",
  )
  .transform((value) => value.replace(/\/+$/, ""));

const vertexCredential = z
  .string()
  .trim()
  .min(1)
  .max(10_000)
  .refine(
    isGoogleCredential,
    "Give a service account's JSON key (type service_account), or an access token",
  );

// What each kind is made of, apart from its key: the person's form adds one where the kind needs it,
// and a bot's request has none (decision 0086), so both are built from these.
const isDefault = z.boolean().optional();
const openai = {
  kind: z.literal("openai"),
  name: providerName,
  modelId: providerModelId.optional(),
  isDefault,
};
const anthropic = {
  kind: z.literal("anthropic"),
  name: providerName,
  modelId: providerModelId.optional(),
  isDefault,
};
const gemini = {
  kind: z.literal("gemini"),
  name: providerName,
  modelId: providerModelId.optional(),
  isDefault,
};
// Bedrock: the regional endpoint, and the id of a model it serves (listed from the endpoint).
const bedrock = {
  kind: z.literal("bedrock"),
  name: providerName,
  baseUrl: bedrockEndpoint,
  modelId: providerModelId,
  isDefault,
};
// Vertex: the project's endpoint, and the id of a model on it, such as google/gemini-2.5-flash.
const vertex = {
  kind: z.literal("vertex"),
  name: providerName,
  baseUrl: vertexEndpoint,
  modelId: providerModelId,
  isDefault,
};
// Azure: the resource URL, and the name of a deployment in it (the model id Azure accepts).
const azure = {
  kind: z.literal("azure"),
  name: providerName,
  baseUrl: azureEndpoint,
  modelId: providerModelId,
  isDefault,
};
const compatible = {
  kind: z.literal("openai-compatible"),
  name: providerName,
  baseUrl: providerBaseUrl,
  modelId: providerModelId,
  isDefault,
};

export const createProviderBody = z.discriminatedUnion("kind", [
  z.object({ ...openai, apiKey }),
  z.object({ ...anthropic, apiKey }),
  z.object({ ...gemini, apiKey }),
  z.object({ ...bedrock, apiKey }),
  z.object({ ...vertex, apiKey: vertexCredential }),
  z.object({ ...azure, apiKey }),
  z.object({ ...compatible, apiKey: apiKey.optional() }),
]);

// A provider a bot asks for: the same, with no key. The person gives it afterwards in a masked card.
export const keylessProviderBody = z.discriminatedUnion("kind", [
  z.object(openai),
  z.object(anthropic),
  z.object(gemini),
  z.object(bedrock),
  z.object(vertex),
  z.object(azure),
  z.object(compatible),
]);

// The kind never changes after creation. An omitted `apiKey` keeps the stored one.
export const updateProviderBody = z.object({
  name: providerName.optional(),
  // A Vertex AI credential (a service account's JSON key) is longer than any other kind's key; the
  // service holds a key of any other kind to `apiKey`'s own limit.
  apiKey: z.union([apiKey, vertexCredential]).optional(),
  baseUrl: providerBaseUrl.optional(),
  modelId: providerModelId.nullable().optional(),
  // Only `true`: a user always keeps one default, and picking another is how it moves.
  isDefault: z.literal(true).optional(),
});

// Lists models before a provider is saved, so the key and URL come in the body, never the query.
export const listModelsBody = z.object({
  kind: z.enum(PROVIDERS),
  apiKey: apiKey.optional(),
  baseUrl: providerBaseUrl.optional(),
});

export type CreateProviderBody = z.infer<typeof createProviderBody>;
export type KeylessProviderBody = z.infer<typeof keylessProviderBody> & { apiKey?: undefined };
export type UpdateProviderBody = z.infer<typeof updateProviderBody>;
