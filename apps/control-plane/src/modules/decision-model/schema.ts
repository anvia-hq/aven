import { z } from "zod";

export const saveDecisionModelBody = z.object({
  kind: z.enum(["jev", "jev-openrouter"]),
  modelId: z.string().trim().min(1).max(200).optional(),
  apiKey: z.string().trim().min(1).max(500).optional(),
});

export type SaveDecisionModelBody = z.infer<typeof saveDecisionModelBody>;
