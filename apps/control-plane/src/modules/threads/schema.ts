import { MAX_SKILL_NAME, SKILL_NAME } from "@aven/agents/skills";
import { ATTACHMENT_LIMITS, MENTION_LIMIT, mentionToken } from "@aven/protocol/events";
import { z } from "zod";

import { attachmentBody } from "../../attachments";

export const threadParams = z.object({ id: z.uuid() });

export const createThreadBody = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1).max(200).optional(),
});

export const updateThreadBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    state: z.enum(["open", "snoozed", "archived"]).optional(),
    visibility: z.enum(["private", "workspace"]).optional(),
  })
  .refine(
    (body) => body.title !== undefined || body.state !== undefined || body.visibility !== undefined,
    {
      message: "Nothing to update",
    },
  );

// Optional per-message choice; without it the sender's default provider runs.
const modelSelection = {
  providerId: z.uuid().optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  reasoningEffort: z.string().trim().min(1).max(20).optional(),
};

// Shipping runs on the model the thread's composer has, which the client names the same way. `mode`
// says whether to update the thread's open pull request or open a separate one (decision 0069);
// without it, the newest pull request decides.
export const shipBody = z
  .object({ ...modelSelection, mode: z.enum(["update", "new"]).optional() })
  .optional();

// A path inside the workspace, as the composer's `@` found it: relative, with no `..` or empty part.
const workspacePath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (path) => !path.includes("\0") && path.split("/").every((part) => part && part !== ".."),
    {
      message: "Not a path inside the workspace",
    },
  );

// A file or a skill the prompt mentions (decision 0036); its token must be in the prompt where it says.
const mention = z.discriminatedUnion("type", [
  z.object({ type: z.literal("file"), name: workspacePath, ...mentionRange() }),
  z.object({
    type: z.literal("skill"),
    name: z.string().max(MAX_SKILL_NAME).regex(SKILL_NAME),
    ...mentionRange(),
  }),
]);

function mentionRange() {
  return { from: z.int().min(0), to: z.int().min(0) };
}

export const sendMessageBody = z
  .object({
    prompt: z.string().trim().max(20_000),
    attachments: z.array(attachmentBody).max(ATTACHMENT_LIMITS.count).optional(),
    mentions: z.array(mention).max(MENTION_LIMIT).optional(),
    ...modelSelection,
  })
  .refine((body) => body.prompt.length > 0 || (body.attachments?.length ?? 0) > 0, {
    message: "Write a message or attach a file",
  })
  .refine(
    ({ prompt, mentions = [] }) =>
      mentions.every((found) => prompt.slice(found.from, found.to) === mentionToken(found)),
    { message: "A mention is not where the prompt has it", path: ["mentions"] },
  );

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
  // For a request for a secret (decision 0047): whose variable it becomes, or that the person
  // would rather not give it. Ignored for any other question.
  secretScope: z.enum(["project", "personal"]).default("project"),
  skipSecrets: z.boolean().optional(),
  ...modelSelection,
});

export type CreateThreadBody = z.infer<typeof createThreadBody>;
export type UpdateThreadBody = z.infer<typeof updateThreadBody>;
export type SendMessageBody = z.infer<typeof sendMessageBody>;
export type AnswerQuestionBody = z.infer<typeof answerQuestionBody>;
