import { z } from "zod";

const LOCAL_PATH = /^\/(?![/\\])[\w\-./?=&%#]*$/;
export const isLocalPath = (path: string) => LOCAL_PATH.test(path);

export const callbackQuery = z.object({
  installation_id: z.coerce.number().int().positive().optional(),
  state: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
});

export const manifestQuery = z.object({
  scope: z.enum(["platform", "workspace"]).optional(),
  name: z.string().trim().min(1).max(34).optional(),
  organization: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "not a GitHub organization name")
    .max(39)
    .optional(),
  public: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const appCallbackQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const connectQuery = z.object({
  next: z.string().refine(isLocalPath, "next must be a path on this site").optional(),
  app: z.string().min(1).max(64).optional(),
});

export const userQuery = z.object({
  app: z.string().min(1).max(64).optional(),
});
