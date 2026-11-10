import { z } from "zod";

export const browserBody = z.object({ port: z.number().int().min(1).max(65535) });
