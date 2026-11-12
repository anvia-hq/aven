import { ACCESS_MAX_NAME } from "@aven/protocol/mcp-access";
import { z } from "zod";

export const createAccessTokenBody = z.object({
  name: z.string().trim().min(1).max(ACCESS_MAX_NAME),
  permissions: z
    .array(z.enum(["read", "change", "destructive"]))
    .min(1)
    .max(3),
});

export const accessTokenParams = z.object({ id: z.uuid() });

export type CreateAccessTokenBody = z.infer<typeof createAccessTokenBody>;
