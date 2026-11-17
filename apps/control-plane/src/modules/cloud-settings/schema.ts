import { z } from "zod";

import { SANDBOX_PROVIDERS } from "@aven/sandbox/settings";

export const saveCloudSettingsBody = z.object({
  provider: z.enum(SANDBOX_PROVIDERS),
  base: z.string().trim().default(""),
  runnerUrl: z.string().trim().default(""),
  apiKey: z.string().trim().optional(),
});

export type SaveCloudSettingsBody = z.infer<typeof saveCloudSettingsBody>;

export const storedCloudSettings = z.object({
  provider: z.enum(SANDBOX_PROVIDERS).default("spaces"),
  base: z.string(),
  runnerUrl: z.string(),
  apiKeyEncrypted: z.string(),
  keyHint: z.string(),
});
