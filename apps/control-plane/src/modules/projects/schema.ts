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

export type ImportProjectBody = z.infer<typeof importProjectBody>;
