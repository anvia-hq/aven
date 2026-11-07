import { z } from "zod";

import { threadParams } from "../threads/schema";
import type { ProcessLogs, ProcessView } from "@aven/protocol/types";

export const processParams = threadParams.extend({ processId: z.string().min(1).max(200) });

const processView: z.ZodType<ProcessView> = z.object({
  id: z.string(),
  command: z.string(),
  cwd: z.string().optional(),
  status: z.enum(["running", "exited", "stopped"]),
  exitCode: z.number().optional(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
});

export const processesAnswer = z.object({ processes: z.array(processView) });

export const logsAnswer: z.ZodType<ProcessLogs> = z.object({
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
});
