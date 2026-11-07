import { ATTACHMENT_LIMITS } from "@aven/protocol/events";
import {
  BOT_AVATAR_MAX,
  BOT_COMPACT_TOKENS,
  BOT_DESCRIPTION_MAX,
  BOT_INSTRUCTION_MAX,
  BOT_MESSAGE_MAX,
  BOT_NAME_MAX,
} from "@aven/protocol/bots";
import { ARTIFACT_NAME } from "@aven/protocol/runtime-wire";
import { z } from "zod";

import { attachmentBody } from "../../attachments";

export const botParams = z.object({ id: z.uuid() });

export const botArtifactParams = botParams.extend({ name: z.string().regex(ARTIFACT_NAME) });

export const updateBotBody = z.object({
  name: z.string().trim().min(1).max(BOT_NAME_MAX).optional(),
  instruction: z.string().trim().max(BOT_INSTRUCTION_MAX).optional(),
  description: z.string().trim().max(BOT_DESCRIPTION_MAX).optional(),
  avatar: z.string().trim().max(BOT_AVATAR_MAX).optional(),
  providerId: z.uuid().nullable().optional(),
  modelId: z.string().trim().min(1).max(200).nullable().optional(),
  reasoningEffort: z.string().trim().min(1).max(50).nullable().optional(),
  compactAfterTokens: z
    .number()
    .int()
    .min(BOT_COMPACT_TOKENS.min)
    .max(BOT_COMPACT_TOKENS.max)
    .nullable()
    .optional(),
});

export type UpdateBotBody = z.infer<typeof updateBotBody>;

export const sendBotMessageBody = z
  .object({
    text: z.string().trim().max(BOT_MESSAGE_MAX),
    attachments: z.array(attachmentBody).max(ATTACHMENT_LIMITS.count).optional(),
  })
  .refine((body) => body.text.length > 0 || (body.attachments?.length ?? 0) > 0, {
    message: "Write a message or attach a file",
  });

export type SendBotMessageBody = z.infer<typeof sendBotMessageBody>;
