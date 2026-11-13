import { z } from "zod";

export const portBody = z.object({ port: z.number().int().min(1).max(65535) });
