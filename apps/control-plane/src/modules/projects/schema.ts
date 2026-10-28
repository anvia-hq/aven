import { z } from "zod";

export const projectParams = z.object({ id: z.uuid() });

export const browseQuery = z.object({ path: z.string().trim().optional() });

export const createDirectoryBody = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
});

export const createProjectBody = z.object({
  name: z.string().trim().min(1).max(200),
  projectPath: z.string().trim().min(1),
});

export type CreateProjectBody = z.infer<typeof createProjectBody>;
