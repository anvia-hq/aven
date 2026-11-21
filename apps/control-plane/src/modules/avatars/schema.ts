import { z } from "zod";

export const avatarParams = z.object({ id: z.string().min(1).max(64) });
