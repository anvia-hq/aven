import { z } from "zod";

export const timezoneBody = z.object({ timezone: z.string().trim().min(1).max(64) });
