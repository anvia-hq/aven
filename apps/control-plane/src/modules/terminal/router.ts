import { Elysia } from "elysia";

import { bytesOf } from "../../bytes";
import { bridgeToRunner, originAllowed } from "../../websocket";
import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import type { TerminalHandle } from "../runtimes/viewer-streams";
import { threadParams } from "../threads/schema";
import { threadsService } from "../threads/service";
import { terminalControl, terminalSize } from "./schema";
import { createTerminalService } from "./service";

// A shell in a thread's sandbox (decision 0053). `/stream` is a WebSocket: the browser's
// keystrokes go in binary messages and so does the shell's output; a resize is a JSON text message.
export const terminalRouter = (hub: RuntimeHub) => {
  const service = createTerminalService(hub);
  const terminals = bridgeToRunner<TerminalHandle>("The terminal is too slow");
  return new Elysia({ prefix: "/threads" }).use(authRouter).ws("/:id/terminal/stream", {
    auth: true,
    org: true,
    params: threadParams,
    query: terminalSize,
    async beforeHandle({ request, status, organizationId, user, params }) {
      if (!originAllowed(request)) return status(403, "Forbidden origin");
      // A thread of another organization is not found before any socket is upgraded.
      const thread = await threadsService.require(organizationId, params.id);
      // The shell sees what the latest run was given: its sender's GitHub account and personal
      // variables. Only that person gets in; before any run, the thread's creator.
      if ((thread.lastRunBy ?? thread.createdBy) !== user.id) {
        return status(403, "Only the person the thread last ran as has its terminal");
      }
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
