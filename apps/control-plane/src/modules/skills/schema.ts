import { MAX_SKILL_FILES } from "@aven/protocol/skills";
import { z } from "zod";

export const skillParams = z.object({ id: z.uuid() });

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

export const installSkillBody = z.object({
  source: z.string().trim().min(1).max(500),
  folder: z.string().max(300).optional(),
});

export type InstallSkillBody = z.infer<typeof installSkillBody>;

export type UploadSkillBody = z.infer<typeof uploadSkillBody>;
