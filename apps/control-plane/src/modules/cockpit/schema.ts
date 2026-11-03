import {
  COCKPIT_BODY_MAX,
  COCKPIT_TITLE_MAX,
  normalizeTag,
  TAG_PATTERN,
  TAG_RULE,
  TAGS_MAX,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@aven/protocol/cockpit";
import { z } from "zod";

export const itemParams = z.object({ id: z.uuid() });

const title = z.string().trim().min(1, "Give it a title").max(COCKPIT_TITLE_MAX);
const body = z.string().max(COCKPIT_BODY_MAX);

// Tags as typed, made lowercase and dashed, each once, in the order given.
const tags = z
  .array(z.string().transform(normalizeTag).pipe(z.string().regex(TAG_PATTERN, TAG_RULE)))
  .max(TAGS_MAX, `At most ${TAGS_MAX} tags`)
  .transform((list) => [...new Set(list)]);

export const createInboxBody = z.object({ title, body: body.optional(), tags: tags.optional() });
export const updateInboxBody = z.object({
  title: title.optional(),
  body: body.optional(),
  tags: tags.optional(),
  done: z.boolean().optional(),
});

const status = z.enum(TASK_STATUSES);
const priority = z.enum(TASK_PRIORITIES);
const dueDate = z.iso.date().nullable();

export const createTaskBody = z.object({
  title,
  description: body.optional(),
  status: status.optional(),
  priority: priority.optional(),
  dueDate: dueDate.optional(),
  tags: tags.optional(),
});
export const updateTaskBody = z.object({
  title: title.optional(),
  description: body.optional(),
  status: status.optional(),
  priority: priority.optional(),
  dueDate: dueDate.optional(),
  tags: tags.optional(),
  /** Its place in its column, between its neighbours', as the board puts it when a card is dropped. */
  position: z.number().finite().optional(),
});

export const createNoteBody = z.object({
  title,
  body: body.optional(),
  tags: tags.optional(),
  pinned: z.boolean().optional(),
});
export const updateNoteBody = z.object({
  title: title.optional(),
  body: body.optional(),
  tags: tags.optional(),
  pinned: z.boolean().optional(),
});

export type CreateInboxBody = z.infer<typeof createInboxBody>;
export type UpdateInboxBody = z.infer<typeof updateInboxBody>;
export type CreateTaskBody = z.infer<typeof createTaskBody>;
export type UpdateTaskBody = z.infer<typeof updateTaskBody>;
export type CreateNoteBody = z.infer<typeof createNoteBody>;
export type UpdateNoteBody = z.infer<typeof updateNoteBody>;
