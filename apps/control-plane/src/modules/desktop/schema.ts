import { z } from "zod";

export const desktopParams = z.object({ id: z.uuid() });

// A runtime is not trusted, so what it answers about a desktop is checked before it is used.
export const desktopInfo = z
  .object({
    state: z.enum(["running", "stopped", "starting", "restarting", "failed"]),
    width: z.number(),
    height: z.number(),
    control: z.object({
      held: z.boolean(),
      holder: z.string().optional(),
      expiresAt: z.string().optional(),
    }),
  })
  .nullable();

export const desktopControl = z
  .object({ held: z.boolean(), holder: z.string().optional(), expiresAt: z.string().optional() })
  .nullable();
