import { z } from "zod";
import type { ComputerInfo } from "@aven/protocol/types";

export const computerInfo: z.ZodType<ComputerInfo | null> = z
  .object({ state: z.enum(["asleep", "waking", "awake"]) })
  .nullable();
