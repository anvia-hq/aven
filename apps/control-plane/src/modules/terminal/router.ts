import { Elysia } from "elysia";

import { bytesOf } from "@aven/server-kit/bytes";
import { bridgeToRunner, originAllowed } from "../../websocket";
import { threadAccess } from "../threads/access";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { terminalControl, terminalSize } from "./schema";
import { createTerminalService } from "./service";
import type { TerminalHandle } from "../runtimes/types";

export const terminalRouter = (hub: RuntimeHub) => {
  const service = createTerminalService(hub);
  const terminals = bridgeToRunner<TerminalHandle>("The terminal is too slow");
  return new Elysia({ prefix: "/threads" }).use(threadAccess).ws("/:id/terminal/stream", {
    thread: "own",
    params: threadParams,
    query: terminalSize,
    async beforeHandle({ request, status, organizationId, user, params }) {
      if (!originAllowed(request)) return status(403, "Forbidden origin");

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
