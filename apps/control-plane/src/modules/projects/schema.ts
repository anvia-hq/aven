import { z } from "zod";

export const projectParams = z.object({ id: z.uuid() });

export const createProjectBody = z.object({
  name: z.string().trim().min(1).max(200),
  /** The runner that hosts the project's sandboxes. */
  runtimeId: z.uuid(),
});

export type CreateProjectBody = z.infer<typeof createProjectBody>;
