import { BOT_AVATAR_MAX, BOT_INSTRUCTION_MAX, BOT_NAME_MAX } from "@aven/protocol/bots";
import { z } from "zod";

export const botParams = z.object({ id: z.uuid() });

// Everything may be changed; what is left out stays as it is.
export const updateBotBody = z.object({
  name: z.string().trim().min(1).max(BOT_NAME_MAX).optional(),
  instruction: z.string().trim().max(BOT_INSTRUCTION_MAX).optional(),
  avatar: z.string().trim().max(BOT_AVATAR_MAX).optional(),
});

export type UpdateBotBody = z.infer<typeof updateBotBody>;
