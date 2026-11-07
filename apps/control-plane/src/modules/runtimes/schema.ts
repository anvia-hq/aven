import { z } from "zod";

export const runtimeParams = z.object({ id: z.uuid() });

export const createRuntimeBody = z.object({ name: z.string().trim().min(1).max(100) });

export type CreateRuntimeBody = z.infer<typeof createRuntimeBody>;

// The release the person was shown in the dialog, so a target that changed meanwhile is refused
// instead of updating to something they did not see (decision 0148).
export const updateRuntimeBody = z
  .object({
    release: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .optional(),
  })
  .optional();
