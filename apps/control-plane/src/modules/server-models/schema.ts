import { z } from "zod";

export const saveServerDecisionBody = z.object({
  kind: z.enum(["jev", "jev-openrouter"]),
  modelId: z.string().trim().min(1).max(200).optional(),
  apiKey: z.string().trim().min(1).max(500).optional(),
});

export const saveServerSmallBody = z.object({
  kind: z.enum(["anthropic", "openai", "gemini"]),
  modelId: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().min(1).max(500).optional(),
});

export const storedServerModel = z.object({
  kind: z.string(),
  modelId: z.string(),
  apiKeyEncrypted: z.string(),
  keyHint: z.string(),
});

export type SaveServerDecisionBody = z.infer<typeof saveServerDecisionBody>;
export type SaveServerSmallBody = z.infer<typeof saveServerSmallBody>;
