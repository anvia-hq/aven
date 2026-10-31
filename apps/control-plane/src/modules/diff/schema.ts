import type { DiffScope, ThreadDiff } from "@aven/protocol/runtime-wire";
import { z } from "zod";

const scopes = ["turn", "all", "unshipped"] as const satisfies readonly DiffScope[];

export const diffQuery = z.object({ scope: z.enum(scopes).default("turn") });

// A runtime is not trusted, so what it answers is checked before it is used. Null is a runtime
// saying the thread has no workspace yet.
export const threadDiff: z.ZodType<ThreadDiff | null> = z
  .object({ patch: z.string(), truncated: z.boolean() })
  .nullable();
