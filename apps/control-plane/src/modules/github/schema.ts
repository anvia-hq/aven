import { z } from "zod";

export const installationParams = z.object({ id: z.uuid() });

export const callbackQuery = z.object({
  installation_id: z.coerce.number().int().positive(),
  state: z.string().min(1),
  /** Present when the app asks for user authorization during installation. */
  code: z.string().min(1).optional(),
});
