import { z } from "zod";

const SUBJECT_SCOPES = ["thread", "project", "organization"] as const;

const DEFAULT_LIFETIME_SECONDS = 600;

export const mintTokenBody = z.object({
  audience: z.string().trim().min(1).max(2048),
  subjectScope: z.enum(SUBJECT_SCOPES).default("thread"),
  lifetime: z.number().int().min(60).max(3600).default(DEFAULT_LIFETIME_SECONDS),
});

export type MintTokenBody = z.infer<typeof mintTokenBody>;
export type SubjectScope = (typeof SUBJECT_SCOPES)[number];
