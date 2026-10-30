import type { DesktopControl, DesktopInfo } from "@aven/protocol/runtime-wire";
import { z } from "zod";

// A runtime is not trusted, so what it answers about a desktop is checked before it is used.
const control = z.object({
  held: z.boolean(),
  holder: z.string().optional(),
  expiresAt: z.string().optional(),
});

// Null is a runtime saying the thread's sandbox is not running.
export const desktopInfo: z.ZodType<DesktopInfo | null> = z
  .object({
    state: z.enum(["running", "stopped", "starting", "restarting", "failed"]),
    width: z.number(),
    height: z.number(),
    control,
  })
  .nullable();

export const desktopControl: z.ZodType<DesktopControl | null> = control.nullable();
