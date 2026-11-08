import { z } from "zod";

export const updateSettingsBody = z.object({
  registrationEnabled: z.boolean(),
});

export const personParams = z.object({ id: z.string().min(1) });
