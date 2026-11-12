import { codexAccessToken } from "@aven/protocol/codex-login";
import { z } from "zod";

export const saveCodexLoginBody = z.object({
  login: z
    .string()
    .trim()
    .min(20)
    .max(100_000)
    .refine((login) => codexAccessToken(login) !== undefined, {
      message: "Paste a ChatGPT access token, or a Codex auth.json with an access_token",
    }),
});

export type SaveCodexLoginBody = z.infer<typeof saveCodexLoginBody>;
