import { z } from "zod";

export const diffParams = z.object({ id: z.uuid() });

export const diffQuery = z.object({ scope: z.enum(["turn", "all"]).default("turn") });

// A runtime is not trusted, so what it answers is checked before it is used. Null is a runtime
// saying the thread has no workspace yet.
export const threadDiff = z.object({ patch: z.string(), truncated: z.boolean() }).nullable();
