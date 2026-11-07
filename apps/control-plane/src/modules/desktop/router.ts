import { Elysia } from "elysia";

import { bytesOf } from "../../bytes";
import { bridgeToRunner, originAllowed } from "../../websocket";
import { threadAccess } from "../threads/access";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { runnerFor } from "../runtimes/ask-runner";
import { createDesktopService } from "./service";
import type { ViewerHandle } from "../runtimes/types";

const VIEWER_SUBPROTOCOL = "binary";

export const desktopRouter = (hub: RuntimeHub) => {
  const service = createDesktopService(runnerFor(hub), { what: "The thread's sandbox" });
  const viewers = bridgeToRunner<ViewerHandle>("The viewer is too slow");
  return new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get(
      "/:id/desktop",
      ({ params, organizationId, user }) => service.status(organizationId, user.id, params.id),
      {
        thread: "own",
        params: threadParams,
      },
    )
    .post(
      "/:id/desktop/wake",
      ({ params, organizationId, user }) => service.wake(organizationId, user.id, params.id),
      { thread: "own", params: threadParams },
    )
    .post(
      "/:id/desktop/takeover",
      ({ params, organizationId, user }) => service.takeover(organizationId, user.id, params.id),
      { thread: "own", params: threadParams },
    )
    .post(
      "/:id/desktop/release",
      ({ params, organizationId, user }) => service.release(organizationId, user.id, params.id),
      { thread: "own", params: threadParams },
    )
    .ws("/:id/desktop/stream", {
      thread: "own",
      params: threadParams,
      beforeHandle({ request, set, status }) {
        if (!originAllowed(request)) return status(403, "Forbidden origin");
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
