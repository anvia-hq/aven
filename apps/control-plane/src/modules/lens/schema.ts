import { z } from "zod";

import { LENS_CAPTURE_MODES } from "@aven/protocol/lens";

export const saveLensBody = z.object({
  baseUrl: z.string().trim().min(1),
  publicKey: z.string().trim().min(1).max(200),
  secretKey: z.string().trim().max(500).optional(),
  captureMode: z.enum(LENS_CAPTURE_MODES).default("safe"),
});

export type SaveLensBody = z.infer<typeof saveLensBody>;

export const storedLensSettings = z.object({
  baseUrl: z.string(),
  publicKey: z.string(),
  secretKeyEncrypted: z.string(),
  keyHint: z.string(),
  captureMode: z.enum(LENS_CAPTURE_MODES).default("safe"),
});
