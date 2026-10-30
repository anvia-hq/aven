import { z } from "zod";

export const skillParams = z.object({ id: z.uuid() });

/** At most this many files, and this many bytes unpacked, in one skill. */
export const MAX_SKILL_FILES = 200;
export const MAX_SKILL_BYTES = 5 * 1024 * 1024;

// A skill's folder as the browser read it (a folder, or a zip it unpacked): paths relative to the
// folder, or to one folder that holds it, and each file's bytes in base64. Paths are checked
// when the folder is put together, not here.
export const uploadSkillBody = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(300),
        data: z.base64(),
      }),
    )
    .min(1)
    // Room for files that are dropped, such as a zip's __MACOSX folder.
    .max(MAX_SKILL_FILES * 2),
});

export const updateSkillBody = z.object({ enabled: z.boolean() });

export type UploadSkillBody = z.infer<typeof uploadSkillBody>;
