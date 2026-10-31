import type { ServerWebSocket } from "bun";

import { trustedOrigins } from "./modules/auth/service";

/** WebSocket close codes the control plane ends a browser's stream with. */
export const CloseCode = {
  GoingAway: 1001,
  PolicyViolation: 1008,
  InternalError: 1011,
} as const;

// A browser always sends its page's origin on a WebSocket, and cookies alone would let another
// site open one. Anything that is not a browser has no Origin and is let through.
export function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return origin === null || trustedOrigins.includes(origin);
}

// Bun's sockets know how much is waiting to go out; Elysia's type for them does not say so.
export const bufferedAmount = (raw: object) =>
  (raw as Pick<ServerWebSocket, "getBufferedAmount">).getBufferedAmount();
