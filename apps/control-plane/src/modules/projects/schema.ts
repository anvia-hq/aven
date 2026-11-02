import { z } from "zod";

export const projectParams = z.object({ id: z.uuid() });

// A project is made by importing a repository an installation can see (decision 0013).
export const importProjectBody = z.object({
  /** The organization's GitHub installation (our id, not GitHub's). */
  installationId: z.uuid(),
  /** `owner/name`. */
  repository: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/)
    // Dot-only segments would climb out of /repos/ when the name is put in a GitHub API path.
    .refine((value) => value.split("/").every((part) => !/^\.+$/.test(part))),
  /** The runner that hosts the project's sandboxes. */
  runtimeId: z.uuid(),
  /** Defaults to the repository's name. */
  name: z.string().trim().min(1).max(200).optional(),
});

// A folder of the repository, from its top (empty). The path goes into a GitHub API path, so no
// empty or dot-only segment, which would climb out of it.
export const folderQuery = z.object({
  path: z
    .string()
    .max(1024)
    .refine(
      (path) => path === "" || path.split("/").every((part) => part !== "" && !/^\.+$/.test(part)),
    )
    .refine((path) => !path.includes("\0"))
    .default(""),
});

// A page of the commit history, from the newest; GitHub allows as many as the history has.
export const commitsQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

// A page of the repository's pull requests or issues, open or closed, from the latest changed.
// GitHub's search gives the first thousand matches, which is a hundred pages of ten.
export const trackedQuery = z.object({
  state: z.enum(["open", "closed"]).default("open"),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

// What may change on a project: the runner its new threads run on (decision 0093).
export const updateProjectBody = z.object({ runtimeId: z.string().uuid() });

export type ImportProjectBody = z.infer<typeof importProjectBody>;
export type UpdateProjectBody = z.infer<typeof updateProjectBody>;
