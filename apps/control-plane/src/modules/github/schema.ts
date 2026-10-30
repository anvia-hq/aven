import { z } from "zod";

// Where the browser may be sent back to: a path on this site, nothing that names another host.
const LOCAL_PATH = /^\/(?![/\\])[\w\-./?=&%#]*$/;
export const isLocalPath = (path: string) => LOCAL_PATH.test(path);

export const installationParams = z.object({ id: z.uuid() });

export const callbackQuery = z.object({
  /** Present after an install; a person who only connects their account comes back without one. */
  installation_id: z.coerce.number().int().positive().optional(),
  state: z.string().min(1),
  /** Present when the app asks for user authorization during installation. */
  code: z.string().min(1).optional(),
});

export const connectQuery = z.object({
  /** A path on this site to come back to once GitHub has been connected. */
  next: z.string().refine(isLocalPath, "next must be a path on this site").optional(),
});
