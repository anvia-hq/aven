import { z } from "zod";

export const providerParams = z.object({ id: z.uuid() });

const name = z.string().trim().min(1).max(100);
const modelId = z.string().trim().min(1).max(200);
const apiKey = z.string().trim().min(1).max(500);
const baseUrl = z
  .url({ protocol: /^https?$/ })
  .max(500)
  .transform((value) => value.replace(/\/+$/, ""));

export const createProviderBody = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("openai"),
    name,
    apiKey,
    modelId: modelId.optional(),
    isDefault: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("anthropic"),
    name,
    apiKey,
    modelId: modelId.optional(),
    isDefault: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("openai-compatible"),
    name,
    baseUrl,
    modelId,
    apiKey: apiKey.optional(),
    isDefault: z.boolean().optional(),
  }),
]);

// The kind never changes after creation. An omitted `apiKey` keeps the stored one.
export const updateProviderBody = z.object({
  name: name.optional(),
  apiKey: apiKey.optional(),
  baseUrl: baseUrl.optional(),
  modelId: modelId.nullable().optional(),
  // Only `true`: a user always keeps one default, and picking another is how it moves.
  isDefault: z.literal(true).optional(),
});

// Lists models before a provider is saved, so the key and URL come in the body, never the query.
export const listModelsBody = z.object({
  kind: z.enum(["openai", "anthropic", "openai-compatible"]),
  apiKey: apiKey.optional(),
  baseUrl: baseUrl.optional(),
});

export type CreateProviderBody = z.infer<typeof createProviderBody>;
export type UpdateProviderBody = z.infer<typeof updateProviderBody>;
