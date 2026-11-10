import { z } from "zod";

export const runtimeParams = z.object({ id: z.uuid() });

export const createRuntimeBody = z.object({ name: z.string().trim().min(1).max(100) });

export const renameRuntimeBody = z.object({ name: z.string().trim().min(1).max(100) });

export const codexLoginBody = z.object({ action: z.enum(["start", "cancel"]) });

export type CreateRuntimeBody = z.infer<typeof createRuntimeBody>;

export const updateRuntimeBody = z
  .object({
    release: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .optional(),
  })
  .optional();
