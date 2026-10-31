import type { ServerWebSocket } from "bun";

import { trustedOrigins } from "./modules/auth/service";
import type { ViewerSink } from "./modules/runtimes/viewer-streams";

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
const bufferedAmount = (raw: object) =>
  (raw as Pick<ServerWebSocket, "getBufferedAmount">).getBufferedAmount();

// Stop a stream whose browser cannot keep up, instead of buffering a runner's output without limit.
const MAX_BROWSER_BUFFER_BYTES = 8 * 1024 * 1024;

/** What of Elysia's socket a bridge uses. */
type BrowserSocket = {
  raw: { send(data: Uint8Array): unknown; readyState: number };
  close(code?: number, reason?: string): unknown;
};

/**
 * Joins browsers' sockets to streams a runner opens (a desktop, a terminal): the runner's bytes go
 * to the browser as they are, one too slow to take them is closed with `tooSlow`, and the stream
 * ends with the socket. `handle(ws)` is a socket's stream once it has opened.
 */
export function bridgeToRunner<Handle extends { close(): void }>(tooSlow: string) {
  const handles = new Map<object, Handle>();
  return {
    async open(ws: BrowserSocket, start: (sink: ViewerSink) => Promise<Handle>) {
      try {
        const handle = await start({
          data(bytes) {
            if (bufferedAmount(ws.raw) > MAX_BROWSER_BUFFER_BYTES) {
              ws.close(CloseCode.PolicyViolation, tooSlow);
              return;
            }
            // Elysia would encode a Uint8Array as JSON text; the native socket sends bytes as bytes.
            ws.raw.send(bytes);
          },
          closed: (reason) => ws.close(CloseCode.GoingAway, reason.slice(0, 120)),
        });
        // The browser may have left while the runner was answering; nothing would close this.
        if (ws.raw.readyState !== WebSocket.OPEN) handle.close();
        else handles.set(ws.raw, handle);
      } catch (error) {
        ws.close(
          CloseCode.InternalError,
          (error instanceof Error ? error.message : "Failed").slice(0, 120),
        );
      }
    },
    handle: (ws: BrowserSocket) => handles.get(ws.raw),
    close(ws: BrowserSocket) {
      handles.get(ws.raw)?.close();
      handles.delete(ws.raw);
    },
  };
}
