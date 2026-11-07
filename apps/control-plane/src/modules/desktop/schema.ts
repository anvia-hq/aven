import type { DesktopControl, DesktopInfo } from "@aven/protocol/runtime-wire";
import { z } from "zod";

const control = z.object({
  held: z.boolean(),
  holder: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const desktopInfo: z.ZodType<DesktopInfo | null> = z
  .object({
    state: z.enum(["running", "stopped", "starting", "restarting", "failed"]),
    width: z.number(),
    height: z.number(),
    control,
  })
  .nullable();

export const desktopControl: z.ZodType<DesktopControl | null> = control.nullable();
