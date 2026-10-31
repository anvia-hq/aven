import { Elysia } from "elysia";

import { bytesOf } from "../../bytes";
import { bufferedAmount, CloseCode, originAllowed } from "../../websocket";
import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import type { ViewerHandle } from "../runtimes/viewer-streams";
import { threadsService } from "../threads/service";
import { threadParams } from "../threads/schema";
import { createDesktopService } from "./service";

// noVNC offers this subprotocol and fails the connection if the server does not pick it.
const VIEWER_SUBPROTOCOL = "binary";
// Stop a viewer whose browser cannot keep up, instead of buffering the desktop without limit.
const MAX_BROWSER_BUFFER_BYTES = 8 * 1024 * 1024;

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
        params: threadParams,
      },
    )
    .post(
      "/:id/desktop/wake",
      ({ params, organizationId, user }) => service.wake(organizationId, user.id, params.id),
      { auth: true, org: true, params: threadParams },
    )
    .post(
      "/:id/desktop/takeover",
      ({ params, organizationId, user }) => service.takeover(organizationId, user.id, params.id),
      { auth: true, org: true, params: threadParams },
    )
    .post(
      "/:id/desktop/release",
      ({ params, organizationId, user }) => service.release(organizationId, user.id, params.id),
      { auth: true, org: true, params: threadParams },
    )
    .ws("/:id/desktop/stream", {
      auth: true,
      org: true,
      params: threadParams,
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
            data(bytes) {
              if (bufferedAmount(ws.raw) > MAX_BROWSER_BUFFER_BYTES) {
                ws.close(CloseCode.PolicyViolation, "The viewer is too slow");
                return;
              }
              // Elysia would encode a Uint8Array as JSON text; the native socket sends bytes as bytes.
              ws.raw.send(bytes);
            },
            closed: (reason) => ws.close(CloseCode.GoingAway, reason.slice(0, 120)),
          });
          // The browser may have left while the runner was answering; nothing would close this.
          if (ws.raw.readyState !== WebSocket.OPEN) handle.close();
          else viewers.set(ws.raw, handle);
        } catch (error) {
          ws.close(
            CloseCode.InternalError,
            (error instanceof Error ? error.message : "Failed").slice(0, 120),
          );
        }
      },
      message(ws, message) {
        if (ArrayBuffer.isView(message)) {
          viewers.get(ws.raw)?.write(bytesOf(message));
        }
      },
      close(ws) {
        viewers.get(ws.raw)?.close();
        viewers.delete(ws.raw);
      },
    });
};
