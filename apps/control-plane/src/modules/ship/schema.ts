import type { RepoPushResult } from "@aven/protocol/runtime-wire";
import { z } from "zod";

// A runtime is not trusted, so what it answers is checked before it is used. Null is a runtime
// saying the thread has no workspace yet.
export const pushResult: z.ZodType<RepoPushResult | null> = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("pushed"), commit: z.string().min(1) }),
    z.object({ kind: z.literal("nothing") }),
  ])
  .nullable();
