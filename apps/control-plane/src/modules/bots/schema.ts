import {
  BOT_AVATAR_MAX,
  BOT_COMPACT_TOKENS,
  BOT_DESCRIPTION_MAX,
  BOT_INSTRUCTION_MAX,
  BOT_NAME_MAX,
} from "@aven/protocol/bots";
import { z } from "zod";

export const botParams = z.object({ id: z.uuid() });

// Everything may be changed; what is left out stays as it is.
export const updateBotBody = z.object({
  name: z.string().trim().min(1).max(BOT_NAME_MAX).optional(),
  instruction: z.string().trim().max(BOT_INSTRUCTION_MAX).optional(),
  description: z.string().trim().max(BOT_DESCRIPTION_MAX).optional(),
  avatar: z.string().trim().max(BOT_AVATAR_MAX).optional(),
  // Null puts the bot back on the person's default. A provider chosen without a model leaves the
  // model to the provider.
  providerId: z.uuid().nullable().optional(),
  modelId: z.string().trim().min(1).max(200).nullable().optional(),
  // A level of the bot's model, checked against it. A changed model starts without one.
  reasoningEffort: z.string().trim().min(1).max(50).nullable().optional(),
  // Null leaves it to the model: 70% of its context window.
  compactAfterTokens: z
    .number()
    .int()
    .min(BOT_COMPACT_TOKENS.min)
    .max(BOT_COMPACT_TOKENS.max)
    .nullable()
    .optional(),
});

export type UpdateBotBody = z.infer<typeof updateBotBody>;

export const sendBotMessageBody = z.object({ text: z.string().trim().min(1).max(4000) });

export type SendBotMessageBody = z.infer<typeof sendBotMessageBody>;
