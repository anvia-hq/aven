import { DECISION_KINDS } from "@aven/protocol/decision-model";
import { z } from "zod";

export const saveDecisionModelBody = z.object({
  kind: z.enum(DECISION_KINDS),
  modelId: z.string().trim().min(1).max(200).optional(),
  apiKey: z.string().trim().min(1).max(500).optional(),
});

export type SaveDecisionModelBody = z.infer<typeof saveDecisionModelBody>;
