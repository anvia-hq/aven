import { Elysia } from "elysia";

import { bytesOf } from "../../bytes";
import { bridgeToRunner, originAllowed } from "../../websocket";
import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import type { ViewerHandle } from "../runtimes/viewer-streams";
import { threadsService } from "../threads/service";
import { threadParams } from "../threads/schema";
import { createDesktopService } from "./service";

// noVNC offers this subprotocol and fails the connection if the server does not pick it.
const VIEWER_SUBPROTOCOL = "binary";

// Watching and taking over a thread's desktop (decision 0015). `/stream` is a WebSocket carrying
// the VNC session in binary messages, as noVNC expects.
export const desktopRouter = (hub: RuntimeHub) => {
  const service = createDesktopService(hub);
  const viewers = bridgeToRunner<ViewerHandle>("The viewer is too slow");
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
        await viewers.open(ws, (sink) => service.openViewer(organizationId, params.id, sink));
      },
      message(ws, message) {
        if (ArrayBuffer.isView(message)) {
          viewers.handle(ws)?.write(bytesOf(message));
        }
      },
      close(ws) {
        viewers.close(ws);
      },
    });
};
