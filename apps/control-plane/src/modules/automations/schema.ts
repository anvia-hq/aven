import { AUTOMATION_NAME_MAX, AUTOMATION_PROMPT_MAX } from "@aven/protocol/automations";
import { z } from "zod";

export const automationParams = z.object({
  id: z.uuid(),
});

export const automationHookParams = z.object({
  id: z.uuid(),
  token: z.string().trim().min(1).max(200),
});

export const createAutomationBody = z
  .object({
    name: z.string().trim().min(1).max(AUTOMATION_NAME_MAX),
    projectId: z.uuid(),
    runtimeId: z.uuid().optional(),
    triggerKind: z.enum(["webhook", "schedule"]),
    cron: z.string().trim().min(1).max(100).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    prompt: z.string().trim().min(1).max(AUTOMATION_PROMPT_MAX),
  })
  .refine((body) => body.triggerKind !== "schedule" || Boolean(body.cron), {
    message: "A schedule automation needs a cron expression",
    path: ["cron"],
  });

export const updateAutomationBody = z
  .object({
    name: z.string().trim().min(1).max(AUTOMATION_NAME_MAX).optional(),
    prompt: z.string().trim().min(1).max(AUTOMATION_PROMPT_MAX).optional(),
    cron: z.string().trim().min(1).max(100).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

export type CreateAutomationBody = z.infer<typeof createAutomationBody>;

export type UpdateAutomationBody = z.infer<typeof updateAutomationBody>;
