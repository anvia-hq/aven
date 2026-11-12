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

export const azureEndpoint = z
  .url({ protocol: /^https$/ })
  .max(500)
  .transform((value) => new URL(value).origin);

export const bedrockEndpoint = z
  .string()
  .trim()
  .max(500)
  .regex(BEDROCK_ENDPOINT, "A Bedrock endpoint is https://bedrock-mantle.<region>.api.aws/v1")
  .transform((value) => value.replace(/\/+$/, ""));

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
const bedrock = {
  kind: z.literal("bedrock"),
  name: providerName,
  baseUrl: bedrockEndpoint,
  modelId: providerModelId,
  isDefault,
};
const vertex = {
  kind: z.literal("vertex"),
  name: providerName,
  baseUrl: vertexEndpoint,
  modelId: providerModelId,
  isDefault,
};
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

export const keylessProviderBody = z.discriminatedUnion("kind", [
  z.object(openai),
  z.object(anthropic),
  z.object(gemini),
  z.object(bedrock),
  z.object(vertex),
  z.object(azure),
  z.object(compatible),
]);

export const updateProviderBody = z.object({
  name: providerName.optional(),
  apiKey: z.union([apiKey, vertexCredential]).optional(),
  baseUrl: providerBaseUrl.optional(),
  modelId: providerModelId.nullable().optional(),
  isDefault: z.literal(true).optional(),
});

export const listModelsBody = z
  .object({
    kind: z.enum(PROVIDERS),
    apiKey: z.string().trim().max(10_000).optional(),
    baseUrl: providerBaseUrl.optional(),
  })
  .superRefine((body, ctx) => {
    if (body.apiKey === undefined) return;

    const check = body.kind === "vertex" ? vertexCredential : apiKey;
    const result = check.safeParse(body.apiKey);

    if (!result.success) {
      ctx.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: result.error.issues[0]?.message ?? "Not a valid key",
      });
    }
  });

export type CreateProviderBody = z.infer<typeof createProviderBody>;
export type KeylessProviderBody = z.infer<typeof keylessProviderBody> & { apiKey?: undefined };
export type UpdateProviderBody = z.infer<typeof updateProviderBody>;
