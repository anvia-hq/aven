import { z } from "zod";

export const runtimeParams = z.object({ id: z.uuid() });

export const createRuntimeBody = z.object({ name: z.string().trim().min(1).max(100) });

export type CreateRuntimeBody = z.infer<typeof createRuntimeBody>;
