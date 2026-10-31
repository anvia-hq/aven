import { Elysia } from "elysia";

import { bytesOf } from "../../bytes";
import { bridgeToRunner, originAllowed } from "../../websocket";
import { authRouter } from "../auth/router";
import { createDesktopService } from "../desktop/service";
import type { RuntimeHub } from "../runtimes/hub";
import type { TerminalHandle, ViewerHandle } from "../runtimes/viewer-streams";
import { terminalControl, terminalSize } from "../terminal/schema";
import { createTerminalService } from "../terminal/service";
import { botRunnerFor, requireOwnBot } from "./computer";
import { botParams } from "./schema";

// noVNC offers this subprotocol and fails the connection if the server does not pick it.
const VIEWER_SUBPROTOCOL = "binary";

// Watching and driving a bot's computer, as a person does a thread's (decisions 0015, 0053 and
// 0059): the same calls and the same streams, found through the bot's owner, not an organization.
// The bot is the person's own, so what they see and type is their own computer.
export const botComputerRouter = (hub: RuntimeHub, runtimeId: string) => {
  const runner = botRunnerFor(hub, runtimeId);
  const desktop = createDesktopService(runner, { what: "The bot's computer" });
  const terminal = createTerminalService(runner, (userId, _you, botId) =>
    requireOwnBot(userId, botId),
  );
  const viewers = bridgeToRunner<ViewerHandle>("The viewer is too slow");
  const terminals = bridgeToRunner<TerminalHandle>("The terminal is too slow");

  return new Elysia({ prefix: "/bots" })
    .use(authRouter)
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
        // Another person's bot is not found before any socket is upgraded.
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
    })
    .ws("/:id/terminal/stream", {
      auth: true,
      params: botParams,
      query: terminalSize,
      async beforeHandle({ request, status, user, params }) {
        if (!originAllowed(request)) return status(403, "Forbidden origin");
        await terminal.requireShell(user.id, user.id, params.id);
      },
      async open(ws) {
        const { user, params, query } = ws.data;
        await terminals.open(ws, (sink) => terminal.open(user.id, params.id, query, sink));
      },
      message(ws, message) {
        const shell = terminals.handle(ws);
        if (!shell) return;
        if (ArrayBuffer.isView(message)) {
          shell.write(bytesOf(message));
          return;
        }
        const control = terminalControl.safeParse(message);
        if (control.success) shell.resize(control.data.cols, control.data.rows);
      },
      close(ws) {
        terminals.close(ws);
      },
    });
};
