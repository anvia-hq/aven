import { Elysia } from "elysia";

import type { RuntimeConnection, RuntimeHub } from "./hub";
import { runtimesService } from "./service";

const bearer = (header: string | null) => header?.match(/^Bearer (.+)$/)?.[1] ?? null;

// The socket a runtime opens. It authenticates with its registration token in the Authorization
// header; a revoked or unknown token never upgrades.
export const connectRouter = (hub: RuntimeHub) => {
  const connections = new WeakMap<object, RuntimeConnection>();
  return new Elysia().ws("/connect", {
    async beforeHandle({ request, status }) {
      const token = bearer(request.headers.get("authorization"));
      const runtime = token ? await runtimesService.authenticate(token) : null;
      if (!runtime) return status(401, "Unauthorized");
    },
    async open(ws) {
      const token = bearer(ws.data.request.headers.get("authorization"));
      const runtime = token ? await runtimesService.authenticate(token) : null;
      if (!runtime) {
        ws.close();
        return;
      }
      void runtimesService.touch(runtime.id);
      connections.set(
        ws.raw,
        hub.attach(
          runtime.id,
          runtime.organizationId,
          (message) => ws.send(message),
          () => ws.close(),
        ),
      );
    },
    message(ws, message) {
      const text = typeof message === "string" ? message : JSON.stringify(message);
      void connections.get(ws.raw)?.receive(text);
    },
    close(ws) {
      connections.get(ws.raw)?.close();
      connections.delete(ws.raw);
    },
  });
};
