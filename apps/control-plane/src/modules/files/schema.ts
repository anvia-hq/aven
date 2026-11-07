import { FILE_SEARCH_LIMIT } from "@aven/protocol/runtime-wire";
import { z } from "zod";
import type { FileContent, FileEntry } from "@aven/protocol/types";

export const filesQuery = z.object({
  path: z
    .string()
    .max(1024)
    .refine((path) => !path.includes("\0"))
    .default(""),
});

export const searchQuery = z.object({
  q: z
    .string()
    .max(200)
    .refine((query) => !query.includes("\0"))
    .default(""),
});

export const folderAnswer: z.ZodType<{ entries: FileEntry[] } | null> = z
  .object({
    entries: z.array(z.object({ name: z.string(), type: z.enum(["file", "directory"]) })),
  })
  .nullable();

export const searchAnswer: z.ZodType<{ paths: string[] } | null> = z
  .object({ paths: z.array(z.string().max(1024)).max(FILE_SEARCH_LIMIT) })
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
