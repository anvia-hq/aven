import { z } from "zod";

import { threadParams } from "../threads/schema";
import type { EnvironmentReadResult, EnvironmentSaveResult } from "@aven/protocol/types";

export { threadParams };

export const environmentSaveAnswer: z.ZodType<EnvironmentSaveResult> = z.object({
  image: z.string(),
});

export const environmentReadAnswer: z.ZodType<EnvironmentReadResult> = z.object({
  savedAt: z.string().nullable(),
});
