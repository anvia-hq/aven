import { z } from "zod";

export const updateSettingsBody = z.object({
  registrationEnabled: z.boolean(),
});

export type UpdateSettingsBody = z.infer<typeof updateSettingsBody>;
