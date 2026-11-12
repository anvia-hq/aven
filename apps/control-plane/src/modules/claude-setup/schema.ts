import { z } from "zod";

export const saveClaudeSetupBody = z.object({
  token: z
    .string()
    .trim()
    .min(20)
    .max(4096)
    .regex(/^sk-ant-oat01-\S+$/, "A Claude setup token starts with sk-ant-oat01-"),
});
