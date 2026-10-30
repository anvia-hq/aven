import type { FileContent, FileEntry } from "@aven/protocol/runtime-wire";
import { z } from "zod";

// A path inside the workspace, empty for its top. The runner confines it; this only keeps the
// call small and well formed.
export const filesQuery = z.object({
  path: z
    .string()
    .max(1024)
    .refine((path) => !path.includes("\0"))
    .default(""),
});

// A runtime is not trusted, so what it answers is checked before it is used. Null is a runtime
// saying the thread has no workspace yet.
export const folderAnswer: z.ZodType<{ entries: FileEntry[] } | null> = z
  .object({
    entries: z.array(z.object({ name: z.string(), type: z.enum(["file", "directory"]) })),
  })
  .nullable();

export const fileAnswer: z.ZodType<FileContent | null> = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("text"),
      text: z.string(),
      size: z.number(),
      truncated: z.boolean(),
    }),
    z.object({ kind: z.literal("binary"), size: z.number() }),
    z.object({ kind: z.literal("missing") }),
  ])
  .nullable();
