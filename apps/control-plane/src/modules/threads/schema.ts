import { z } from "zod";

export const threadParams = z.object({ id: z.uuid() });

export const createThreadBody = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1).max(200).optional(),
});

export const updateThreadBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    state: z.enum(["open", "snoozed", "archived"]).optional(),
  })
  .refine((body) => body.title !== undefined || body.state !== undefined, {
    message: "Nothing to update",
  });

export const sendMessageBody = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  // Optional per-message choice; without it the sender's default provider runs.
  providerId: z.uuid().optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  reasoningEffort: z.string().trim().min(1).max(20).optional(),
});

export type CreateThreadBody = z.infer<typeof createThreadBody>;
export type UpdateThreadBody = z.infer<typeof updateThreadBody>;
