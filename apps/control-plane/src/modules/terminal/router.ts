import { Elysia } from "elysia";

import { bytesOf } from "@aven/server-kit/bytes";
import { bridgeToRunner, originAllowed } from "../../websocket";
import { runtimeActivity } from "../runtimes/activity";
import { threadAccess } from "../threads/access";
import { threadsService } from "../threads/service";
import type { RuntimeHub } from "../runtimes/hub";
import { threadParams } from "../threads/schema";
import { terminalControl, terminalSize } from "./schema";
import { createTerminalService } from "./service";
import type { TerminalHandle } from "../runtimes/types";

export const terminalRouter = (hub: RuntimeHub) => {
  const service = createTerminalService(hub);
  const terminals = bridgeToRunner<TerminalHandle>("The terminal is too slow");
  const runtimes = new WeakMap<object, string>();
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

      const runtimeId = await threadsService.runtimeOf(params.id);

      if (!runtimeId) return;

      runtimes.set(ws.raw, runtimeId);
      runtimeActivity.touch(runtimeId);
    },
    message(ws, message) {
      const runtimeId = runtimes.get(ws.raw);

      if (runtimeId) runtimeActivity.touch(runtimeId);

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
