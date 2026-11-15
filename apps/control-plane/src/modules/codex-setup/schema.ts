import { z } from "zod";

export const saveCodexSetupBody = z.object({
  token: z
    .string()
    .trim()
    .min(20)
    .max(4096)
    .regex(/^sk-(?!ant)\S+$/, "A Codex API key starts with sk- and is a single line"),
});
