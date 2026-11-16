import { parseCodexAuth } from "@aven/protocol/codex-auth";
import { BEDROCK_ENDPOINT, vertexPartsOf } from "@aven/protocol/providers";
import { PROVIDERS } from "@aven/protocol/runtime-wire";
import type { Provider } from "@aven/protocol/types";
import { providerBaseUrl, providerModelId, providerName } from "@aven/protocol/provider-schema";
import { z } from "zod";

import { isGoogleCredential } from "./google-auth";

export const providerParams = z.object({ id: z.uuid() });

const apiKey = z.string().trim().min(1).max(500);
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

const claudeSubscription = {
  kind: z.literal("claude-subscription"),
  name: providerName,
  modelId: providerModelId.optional(),
  isDefault,
};

const codexSubscription = {
  kind: z.literal("codex-subscription"),
  name: providerName,
  modelId: providerModelId.optional(),
  isDefault,
};

const claudeSetupToken = z
  .string()
  .trim()
  .min(20)
  .max(4096)
  .regex(/^sk-ant-oat01-\S+$/, "A Claude setup token starts with sk-ant-oat01-");

const codexApiKey = z
  .string()
  .trim()
  .min(20)
  .max(20_000)
  .refine(
    (value) => parseCodexAuth(value) !== undefined,
    "Paste the contents of ~/.codex/auth.json after running codex login with your ChatGPT account",
  );

export const createProviderBody = z.discriminatedUnion("kind", [
  z.object({ ...openai, apiKey }),
  z.object({ ...anthropic, apiKey }),
  z.object({ ...gemini, apiKey }),
  z.object({ ...bedrock, apiKey }),
  z.object({ ...vertex, apiKey: vertexCredential }),
  z.object({ ...azure, apiKey }),
  z.object({ ...compatible, apiKey: apiKey.optional() }),
  z.object({ ...claudeSubscription, apiKey: claudeSetupToken }),
  z.object({ ...codexSubscription, apiKey: codexApiKey }),
]);

export const keylessProviderBody = z.discriminatedUnion("kind", [
  z.object(openai),
  z.object(anthropic),
  z.object(gemini),
  z.object(bedrock),
  z.object(vertex),
  z.object(azure),
  z.object(compatible),
  z.object(claudeSubscription),
  z.object(codexSubscription),
]);

export const updateProviderBody = z.object({
  name: providerName.optional(),
  apiKey: z.union([apiKey, vertexCredential, claudeSetupToken, codexApiKey]).optional(),
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

export function credentialFor(kind: Provider) {
  if (kind === "claude-subscription") return claudeSetupToken;

  if (kind === "codex-subscription") return codexApiKey;

  if (kind === "vertex") return vertexCredential;

  return apiKey;
}

export type CreateProviderBody = z.infer<typeof createProviderBody>;
export type KeylessProviderBody = z.infer<typeof keylessProviderBody> & { apiKey?: undefined };
export type UpdateProviderBody = z.infer<typeof updateProviderBody>;

export const codexDevicePollBody = z.object({
  deviceAuthId: z.string().trim().min(1).max(200),
  userCode: z.string().trim().min(1).max(100),
  providerId: z.uuid().optional(),
  modelId: providerModelId.optional(),
});
