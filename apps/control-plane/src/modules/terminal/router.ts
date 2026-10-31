import { Elysia } from "elysia";

import { bytesOf } from "../../bytes";
import { bufferedAmount, CloseCode, originAllowed } from "../../websocket";
import { authRouter } from "../auth/router";
import type { RuntimeHub } from "../runtimes/hub";
import type { TerminalHandle } from "../runtimes/viewer-streams";
import { threadParams } from "../threads/schema";
import { threadsService } from "../threads/service";
import { terminalControl, terminalSize } from "./schema";
import { createTerminalService } from "./service";

// Stop a terminal whose browser cannot keep up, instead of buffering a runaway command's output.
const MAX_BROWSER_BUFFER_BYTES = 8 * 1024 * 1024;

// A shell in a thread's sandbox (decision 0053). `/stream` is a WebSocket: the browser's
// keystrokes go in binary messages and so does the shell's output; a resize is a JSON text message.
export const terminalRouter = (hub: RuntimeHub) => {
  const service = createTerminalService(hub);
  const terminals = new Map<object, TerminalHandle>();
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
      try {
        const handle = await service.open(organizationId, params.id, query, {
          data(bytes) {
            if (bufferedAmount(ws.raw) > MAX_BROWSER_BUFFER_BYTES) {
              ws.close(CloseCode.PolicyViolation, "The terminal is too slow");
              return;
            }
            // Elysia would encode a Uint8Array as JSON text; the native socket sends bytes as bytes.
            ws.raw.send(bytes);
          },
          closed: (reason) => ws.close(CloseCode.GoingAway, reason.slice(0, 120)),
        });
        // The browser may have left while the runner was answering; nothing would close this.
        if (ws.raw.readyState !== WebSocket.OPEN) handle.close();
        else terminals.set(ws.raw, handle);
      } catch (error) {
        ws.close(
          CloseCode.InternalError,
          (error instanceof Error ? error.message : "Failed").slice(0, 120),
        );
      }
    },
    message(ws, message) {
      const terminal = terminals.get(ws.raw);
      if (!terminal) return;
      if (ArrayBuffer.isView(message)) {
        terminal.write(bytesOf(message));
        return;
      }
      const control = terminalControl.safeParse(message);
      if (control.success) terminal.resize(control.data.cols, control.data.rows);
    },
    close(ws) {
      terminals.get(ws.raw)?.close();
      terminals.delete(ws.raw);
    },
  });
};
