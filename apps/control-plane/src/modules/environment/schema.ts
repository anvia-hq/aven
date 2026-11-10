import { z } from "zod";

import { threadParams } from "../threads/schema";
import type { EnvironmentSaveResult } from "@aven/protocol/types";

export { threadParams };

export const environmentSaveAnswer: z.ZodType<EnvironmentSaveResult> = z.object({
  image: z.string(),
});
