import { Elysia } from "elysia";

import { bytesOf } from "../../bytes";
import { bridgeToRunner, originAllowed } from "../../websocket";
import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import type { TerminalHandle } from "../runtimes/viewer-streams";
import { threadParams } from "../threads/schema";
import { terminalControl, terminalSize } from "./schema";
import { threadTerminalService } from "./service";

// A shell in a thread's sandbox (decision 0053). `/stream` is a WebSocket: the browser's
// keystrokes go in binary messages and so does the shell's output; a resize is a JSON text message.
export const terminalRouter = (hub: RuntimeHub) => {
  const service = threadTerminalService(hub);
  const terminals = bridgeToRunner<TerminalHandle>("The terminal is too slow");
  return new Elysia({ prefix: "/threads" }).use(authRouter).ws("/:id/terminal/stream", {
    auth: true,
    org: true,
    params: threadParams,
    query: terminalSize,
    async beforeHandle({ request, status, organizationId, user, params }) {
      if (!originAllowed(request)) return status(403, "Forbidden origin");
      // Checked before any socket is upgraded.
      await service.requireShell(organizationId, user.id, params.id);
    },
    async open(ws) {
      const { organizationId, params, query } = ws.data;
      await terminals.open(ws, (sink) => service.open(organizationId, params.id, query, sink));
    },
    message(ws, message) {
      const terminal = terminals.handle(ws);
      if (!terminal) return;
      if (ArrayBuffer.isView(message)) {
        terminal.write(bytesOf(message));
        return;
      }
      const control = terminalControl.safeParse(message);
      if (control.success) terminal.resize(control.data.cols, control.data.rows);
    },
    close(ws) {
      terminals.close(ws);
    },
  });
};
