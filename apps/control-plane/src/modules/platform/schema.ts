import { z } from "zod";

export const updateSettingsBody = z.object({
  registrationEnabled: z.boolean(),
});

export const personParams = z.object({ id: z.string().min(1) });

export const runtimeParams = z.object({ id: z.uuid() });

export const removeLeftoversBody = z.object({
  containers: z.array(z.string().min(1).max(300)).max(500),
  images: z.array(z.string().min(1).max(300)).max(500),
});
