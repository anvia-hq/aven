import { DIFF_SCOPES, type ThreadDiff } from "@aven/protocol/runtime-wire";
import { z } from "zod";

export const diffQuery = z.object({ scope: z.enum(DIFF_SCOPES).default("turn") });

// A runtime is not trusted, so what it answers is checked before it is used. Null is a runtime
// saying the thread has no workspace yet.
export const threadDiff: z.ZodType<ThreadDiff | null> = z
  .object({ patch: z.string(), truncated: z.boolean() })
  .nullable();
