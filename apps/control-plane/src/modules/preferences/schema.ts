import { z } from "zod";

export const timezoneBody = z.object({ timezone: z.string().trim().min(1).max(64) });

export const followUpsBody = z.object({
  enabled: z.boolean(),
  providerId: z.string().trim().min(1).max(64).nullable(),
  modelId: z.string().trim().min(1).max(200).nullable(),
});
