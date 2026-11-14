import { z } from "zod";

export const providerName = z.string().trim().min(1).max(100);
export const providerModelId = z.string().trim().min(1).max(200);

export const providerBaseUrl = z
  .url({ protocol: /^https?$/ })
  .max(500)
  .transform((value) => value.replace(/\/+$/, ""));
