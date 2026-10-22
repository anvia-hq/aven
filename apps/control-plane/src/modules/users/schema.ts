import { z } from "zod";

export const userParams = z.object({ id: z.uuid() });

export const createUserBody = z.object({
  email: z.email(),
  name: z.string().min(1),
});

export const updateUserBody = createUserBody.partial();

export type CreateUserBody = z.infer<typeof createUserBody>;
export type UpdateUserBody = z.infer<typeof updateUserBody>;
