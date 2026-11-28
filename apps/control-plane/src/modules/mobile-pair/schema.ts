import { z } from "zod";

export const exchangePairingBody = z.object({
  code: z.string().trim().min(16).max(256),
});

export const storedPairingValue = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
});
