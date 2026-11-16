import { z } from "zod";

export const saveCloudSettingsBody = z.object({
  base: z.string().trim().min(1),
  runnerUrl: z.string().trim().min(1),
  apiKey: z.string().trim().optional(),
});

export type SaveCloudSettingsBody = z.infer<typeof saveCloudSettingsBody>;

export const storedCloudSettings = z.object({
  base: z.string(),
  runnerUrl: z.string(),
  apiKeyEncrypted: z.string(),
  keyHint: z.string(),
});
