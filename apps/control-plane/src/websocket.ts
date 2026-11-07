import type { ServerWebSocket } from "bun";

import { trustedOrigins } from "./modules/auth/service";
import type { ViewerSink } from "./modules/runtimes/types";

export const CloseCode = {
  GoingAway: 1001,
  PolicyViolation: 1008,
  InternalError: 1011,
} as const;

export function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return origin === null || trustedOrigins.includes(origin);
}

const bufferedAmount = (raw: object) =>
  (raw as Pick<ServerWebSocket, "getBufferedAmount">).getBufferedAmount();

const MAX_BROWSER_BUFFER_BYTES = 8 * 1024 * 1024;

type BrowserSocket = {
  raw: { send(data: Uint8Array): unknown; readyState: number };
  close(code?: number, reason?: string): unknown;
};

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
            ws.raw.send(bytes);
          },
          closed: (reason) => ws.close(CloseCode.GoingAway, reason.slice(0, 120)),
        });
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
