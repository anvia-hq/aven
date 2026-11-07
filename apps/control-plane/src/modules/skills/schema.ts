import { z } from "zod";

export const skillParams = z.object({ id: z.uuid() });

export const MAX_SKILL_FILES = 200;
export const MAX_SKILL_BYTES = 5 * 1024 * 1024;

export const uploadSkillBody = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(300),
        data: z.base64(),
      }),
    )
    .min(1)
    .max(MAX_SKILL_FILES * 2),
});

export const updateSkillBody = z.object({ enabled: z.boolean() });

export type UploadSkillBody = z.infer<typeof uploadSkillBody>;
