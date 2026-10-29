import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { trustedOrigins } from "../auth/service";
import type { RuntimeHub, ViewerHandle } from "../runtimes/hub";
import { threadsService } from "../threads/service";
import { desktopParams } from "./schema";
import { createDesktopService } from "./service";

// noVNC offers this subprotocol and fails the connection if the server does not pick it.
const VIEWER_SUBPROTOCOL = "binary";
// Stop a viewer whose browser cannot keep up, instead of buffering the desktop without limit.
const MAX_BROWSER_BUFFER_BYTES = 8 * 1024 * 1024;
const GOING_AWAY = 1001;
const POLICY_VIOLATION = 1008;
const INTERNAL_ERROR = 1011;

// A browser always sends its page's origin on a WebSocket, and cookies alone would let another
// site open one. Anything that is not a browser has no Origin and is let through.
function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return origin === null || trustedOrigins.includes(origin);
}

// Bun's sockets know how much is waiting to go out; Elysia's type for them does not say so.
const bufferedAmount = (raw: object) =>
  (raw as { getBufferedAmount(): number }).getBufferedAmount();

// Watching and taking over a thread's desktop (decision 0015). `/stream` is a WebSocket carrying
// the VNC session in binary messages, as noVNC expects.
export const desktopRouter = (hub: RuntimeHub) => {
  const service = createDesktopService(hub);
  const viewers = new Map<object, ViewerHandle>();
  return new Elysia({ prefix: "/threads" })
    .use(authRouter)
    .get(
      "/:id/desktop",
      ({ params, organizationId, user }) => service.status(organizationId, user.id, params.id),
      {
        auth: true,
        org: true,
        params: desktopParams,
      },
    )
    .post(
      "/:id/desktop/takeover",
      ({ params, organizationId, user }) => service.takeover(organizationId, user.id, params.id),
      { auth: true, org: true, params: desktopParams },
    )
    .post(
      "/:id/desktop/release",
      ({ params, organizationId, user }) => service.release(organizationId, user.id, params.id),
      { auth: true, org: true, params: desktopParams },
    )
    .ws("/:id/desktop/stream", {
      auth: true,
      org: true,
      params: desktopParams,
      async beforeHandle({ request, set, status, organizationId, params }) {
        if (!originAllowed(request)) return status(403, "Forbidden origin");
        // A thread of another organization is not found before any socket is upgraded.
        await threadsService.require(organizationId, params.id);
        const offered = request.headers.get("sec-websocket-protocol") ?? "";
        if (offered.split(",").some((protocol) => protocol.trim() === VIEWER_SUBPROTOCOL)) {
          set.headers["sec-websocket-protocol"] = VIEWER_SUBPROTOCOL;
        }
      },
      async open(ws) {
        const { organizationId, params } = ws.data;
        try {
          const handle = await service.openViewer(organizationId, params.id, {
            opened: () => undefined,
            data(bytes) {
              if (bufferedAmount(ws.raw) > MAX_BROWSER_BUFFER_BYTES) {
                ws.close(POLICY_VIOLATION, "The viewer is too slow");
                return;
              }
              // Elysia would encode a Uint8Array as JSON text; the native socket sends bytes as bytes.
              ws.raw.send(bytes);
            },
            closed: (reason) => ws.close(GOING_AWAY, reason.slice(0, 120)),
          });
          viewers.set(ws.raw, handle);
        } catch (error) {
          ws.close(
            INTERNAL_ERROR,
            (error instanceof Error ? error.message : "Failed").slice(0, 120),
          );
        }
      },
      message(ws, message) {
        if (ArrayBuffer.isView(message)) {
          viewers
            .get(ws.raw)
            ?.write(new Uint8Array(message.buffer, message.byteOffset, message.byteLength));
        }
      },
      close(ws) {
        viewers.get(ws.raw)?.close();
        viewers.delete(ws.raw);
      },
    });
};
