import { z } from "zod";

export const userParams = z.object({ id: z.string().min(1) });

export const updateUserBody = z.object({
  name: z.string().min(1).max(100),
});

export type UpdateUserBody = z.infer<typeof updateUserBody>;
