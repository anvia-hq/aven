import { z } from "zod";

export const saveClaudeSetupBody = z.object({
  token: z.string().trim().min(20).max(4096).regex(/^\S+$/, "A Claude setup token is one line"),
});
