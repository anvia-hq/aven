import { z } from "zod";

export const projectParams = z.object({ id: z.uuid() });

export const browseQuery = z.object({
  path: z.string().trim().optional(),
  /** Browse a runtime's disk instead of the control plane's. */
  runtimeId: z.uuid().optional(),
});

export const createDirectoryBody = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  runtimeId: z.uuid().optional(),
});

export const createProjectBody = z.object({
  name: z.string().trim().min(1).max(200),
  projectPath: z.string().trim().min(1),
  /** The runtime whose disk the path is on; omit for the control plane's own machine. */
  runtimeId: z.uuid().optional(),
});

export type CreateProjectBody = z.infer<typeof createProjectBody>;
