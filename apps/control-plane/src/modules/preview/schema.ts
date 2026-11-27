import { PREVIEW_MAX_PATH_LENGTH } from "@aven/protocol/preview";
import { z } from "zod";

export const portBody = z.object({
  port: z.number().int().min(1).max(65535),
  path: z.string().max(PREVIEW_MAX_PATH_LENGTH).optional(),
});
