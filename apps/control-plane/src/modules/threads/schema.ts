import { ATTACHMENT_LIMITS } from "@aven/protocol/events";
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

// Optional per-message choice; without it the sender's default provider runs.
const modelSelection = {
  providerId: z.uuid().optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  reasoningEffort: z.string().trim().min(1).max(20).optional(),
};

// A file sent with a message, its bytes in base64; sizes are checked once decoded (decision 0034).
const attachment = z.object({
  name: z.string().trim().min(1).max(255),
  // What the browser says the file is; an image's type is read from its bytes instead.
  mediaType: z
    .string()
    .regex(/^[\w.+-]+\/[\w.+-]+$/)
    .max(100)
    .optional(),
  data: z.base64(),
});

export const sendMessageBody = z
  .object({
    prompt: z.string().trim().max(20_000),
    attachments: z.array(attachment).max(ATTACHMENT_LIMITS.count).optional(),
    ...modelSelection,
  })
  .refine((body) => body.prompt.length > 0 || (body.attachments?.length ?? 0) > 0, {
    message: "Write a message or attach a file",
  });

// The user's answers to the agent's question, one per question; the run continues with the model
// chosen here like a message would.
export const answerQuestionBody = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(100),
        value: z.string().trim().min(1).max(20_000),
      }),
    )
    .min(1)
    .max(4),
  ...modelSelection,
});

export type CreateThreadBody = z.infer<typeof createThreadBody>;
export type UpdateThreadBody = z.infer<typeof updateThreadBody>;
export type SendMessageBody = z.infer<typeof sendMessageBody>;
export type AttachmentBody = z.infer<typeof attachment>;
export type AnswerQuestionBody = z.infer<typeof answerQuestionBody>;
