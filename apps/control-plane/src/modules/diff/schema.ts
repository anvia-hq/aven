import { DIFF_SCOPES } from "@aven/protocol/runtime-wire";
import { z } from "zod";
import type { ThreadDiff } from "@aven/protocol/types";

export const diffQuery = z.object({
  scope: z.enum(DIFF_SCOPES).default("turn"),
  summary: z.enum(["1", "true", "0", "false"]).optional(),
});

const diffSummary = z.object({
  files: z.number(),
  additions: z.number(),
  deletions: z.number(),
});

export const threadDiff: z.ZodType<ThreadDiff | null> = z
  .object({
    patch: z.string(),
    truncated: z.boolean(),
    branch: z.string().nullish(),
    summary: diffSummary.optional(),
  })
  .nullable();
