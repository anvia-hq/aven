import { z } from "zod";

export const runtimeParams = z.object({ id: z.uuid() });

export const createRuntimeBody = z.object({ name: z.string().trim().min(1).max(100) });

export const renameRuntimeBody = z.object({ name: z.string().trim().min(1).max(100) });

export type CreateRuntimeBody = z.infer<typeof createRuntimeBody>;

export const updateRuntimeBody = z
  .object({
    release: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .optional(),
  })
  .optional();

export const foldersQuery = z.object({ path: z.string().max(4096).optional() });

export const createFolderBody = z.object({
  path: z.string().min(1).max(4096),
  name: z.string().trim().min(1).max(255),
});
