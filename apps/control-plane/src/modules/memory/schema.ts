import {
  MEMORY_NOTE_MAX,
  MEMORY_NOTE_NAME,
  MEMORY_NOTE_NAME_RULE,
  MEMORY_SCOPES,
} from "@aven/protocol/memory";
import { z } from "zod";

const noteName = z.string().regex(MEMORY_NOTE_NAME, MEMORY_NOTE_NAME_RULE);
const noteBody = z.string().max(MEMORY_NOTE_MAX);

export const noteParams = z.object({ id: z.uuid() });

export const createNoteBody = z
  .object({
    scope: z.enum(MEMORY_SCOPES),
    projectId: z.uuid().optional(),
    botId: z.uuid().optional(),
    name: noteName,
    body: noteBody,
  })
  .refine((body) => body.scope !== "project" || body.projectId, {
    message: "A project's note needs its project",
    path: ["projectId"],
  })
  .refine((body) => body.scope !== "bot" || body.botId, {
    message: "A bot's note needs its bot",
    path: ["botId"],
  });

export const updateNoteBody = z
  .object({ name: noteName.optional(), body: noteBody.optional() })
  .refine((body) => body.name !== undefined || body.body !== undefined, {
    message: "Change the name, the body or both",
  });
