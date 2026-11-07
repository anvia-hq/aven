import { Elysia } from "elysia";

import { bytesOf } from "../../bytes";
import { bridgeToRunner, originAllowed } from "../../websocket";
import { authRouter } from "../auth/router";
import { createArtifactsService } from "../artifacts/service";
import { createDesktopService } from "../desktop/service";
import type { RuntimeHub } from "../runtimes/hub";
import type { ViewerHandle } from "../runtimes/viewer-streams";
import { botRunnerFor, requireOwnBot } from "./computer";
import { botArtifactParams, botParams } from "./schema";

const VIEWER_SUBPROTOCOL = "binary";

export const botComputerRouter = (hub: RuntimeHub, runtimeId: string) => {
  const runner = botRunnerFor(hub, runtimeId);
  const desktop = createDesktopService(runner, { what: "The bot's computer" });
  const artifacts = createArtifactsService(runner);
  const viewers = bridgeToRunner<ViewerHandle>("The viewer is too slow");

  return new Elysia({ prefix: "/bots" })
    .use(authRouter)
    .get(
      "/:id/artifacts/:name",
      ({ params, user, request }) =>
        artifacts.read(user.id, params.id, params.name, request.headers.get("range")),
      {
        auth: true,
        params: botArtifactParams,
      },
    )
    .get("/:id/desktop", ({ params, user }) => desktop.status(user.id, user.id, params.id), {
      auth: true,
      params: botParams,
    })
    .post("/:id/desktop/wake", ({ params, user }) => desktop.wake(user.id, user.id, params.id), {
      auth: true,
      params: botParams,
    })
    .post(
      "/:id/desktop/takeover",
      ({ params, user }) => desktop.takeover(user.id, user.id, params.id),
      { auth: true, params: botParams },
    )
    .post(
      "/:id/desktop/release",
      ({ params, user }) => desktop.release(user.id, user.id, params.id),
      { auth: true, params: botParams },
    )
    .ws("/:id/desktop/stream", {
      auth: true,
      params: botParams,
      async beforeHandle({ request, set, status, user, params }) {
        if (!originAllowed(request)) return status(403, "Forbidden origin");
        await requireOwnBot(user.id, params.id);
        const offered = request.headers.get("sec-websocket-protocol") ?? "";
        if (offered.split(",").some((protocol) => protocol.trim() === VIEWER_SUBPROTOCOL)) {
          set.headers["sec-websocket-protocol"] = VIEWER_SUBPROTOCOL;
        }
      },
      async open(ws) {
        const { user, params } = ws.data;
        await viewers.open(ws, (sink) => desktop.openViewer(user.id, params.id, sink));
      },
      message(ws, message) {
        if (ArrayBuffer.isView(message)) viewers.handle(ws)?.write(bytesOf(message));
      },
      close(ws) {
        viewers.close(ws);
      },
    });
};
