import { DIFF_SCOPES } from "@aven/protocol/runtime-wire";
import { z } from "zod";
import type { ThreadDiff } from "@aven/protocol/types";

export const diffQuery = z.object({ scope: z.enum(DIFF_SCOPES).default("turn") });

export const threadDiff: z.ZodType<ThreadDiff | null> = z
  .object({ patch: z.string(), truncated: z.boolean() })
  .nullable();
