import { z } from "zod";

import { threadParams } from "../threads/schema";
import type { ActionRunResult, ProcessView } from "@aven/protocol/types";

export const actionBody = z.object({
  name: z.string().trim().min(1).max(40),
  providerId: z.uuid().optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  reasoningEffort: z.string().trim().min(1).max(20).optional(),
});

export { threadParams };

const processView: z.ZodType<ProcessView> = z.object({
  id: z.string(),
  command: z.string(),
  cwd: z.string().optional(),
  status: z.enum(["running", "exited", "stopped"]),
  exitCode: z.number().optional(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
});

export const actionRunAnswer: z.ZodType<ActionRunResult> = z.object({ process: processView });
