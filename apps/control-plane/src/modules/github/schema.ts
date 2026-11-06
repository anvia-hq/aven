import { z } from "zod";

// Where the browser may be sent back to: a path on this site, nothing that names another host.
const LOCAL_PATH = /^\/(?![/\\])[\w\-./?=&%#]*$/;
export const isLocalPath = (path: string) => LOCAL_PATH.test(path);

export const installationParams = z.object({ id: z.uuid() });

export const callbackQuery = z.object({
  /** Present after an install; a person who only connects their account comes back without one. */
  installation_id: z.coerce.number().int().positive().optional(),
  /** Ours, when the trip started here; GitHub sends none when the app was installed from its own page. */
  state: z.string().min(1).optional(),
  /** Present when the app asks for user authorization during installation. */
  code: z.string().min(1).optional(),
});

export const manifestQuery = z.object({
  /** Whose app: the platform's, for a platform owner, or the active workspace's own (decision 0123). */
  scope: z.enum(["platform", "workspace"]).optional(),
  /** The app's name on GitHub, which has to be unique there (at most 34 characters). */
  name: z.string().trim().min(1).max(34).optional(),
  /** The GitHub organization that is to own the app, instead of the person. */
  organization: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "not a GitHub organization name")
    .max(39)
    .optional(),
  /** Whether any account or organization may install the app, not only its owner. */
  public: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const appCallbackQuery = z.object({
  /** The code GitHub gives for the app it created; it works once. */
  code: z.string().min(1),
  state: z.string().min(1),
});

export const connectQuery = z.object({
  /** A path on this site to come back to once GitHub has been connected. */
  next: z.string().refine(isLocalPath, "next must be a path on this site").optional(),
  /** The app to connect for, when it is not the workspace's own: `platform` or a workspace's app id (decision 0123). */
  app: z.string().min(1).max(64).optional(),
});

export const userQuery = z.object({
  /** The app to ask about; the workspace's own, else the platform's, when left out. */
  app: z.string().min(1).max(64).optional(),
});
