import { z } from "zod";

export const desktopParams = z.object({ id: z.uuid() });

// A runtime is not trusted, so what it answers about a desktop is checked before it is used.
const control = z.object({
  held: z.boolean(),
  holder: z.string().optional(),
  expiresAt: z.string().optional(),
});

// Null is a runtime saying the thread's sandbox is not running.
export const desktopInfo = z
  .object({
    state: z.enum(["running", "stopped", "starting", "restarting", "failed"]),
    width: z.number(),
    height: z.number(),
    control,
  })
  .nullable();

export const desktopControl = control.nullable();
