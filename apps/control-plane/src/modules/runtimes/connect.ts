import { Elysia } from "elysia";

import type { RuntimeConnection, RuntimeHub } from "./hub";
import { runtimesService } from "./service";

const bearer = (header: string | null) => header?.match(/^Bearer (.+)$/)?.[1] ?? null;

// The socket a runtime opens. It authenticates with its registration token in the Authorization
// header; a revoked or unknown token never upgrades.
export const connectRouter = (hub: RuntimeHub) => {
  const attaching = new Map<object, Promise<RuntimeConnection | undefined>>();
  return new Elysia().ws("/connect", {
    async beforeHandle({ request, status }) {
      const token = bearer(request.headers.get("authorization"));
      const runtime = token ? await runtimesService.authenticate(token) : null;
      if (!runtime) return status(401, "Unauthorized");
    },
    open(ws) {
      // Frames can arrive while the token is still being checked, so `message` waits on this.
      attaching.set(
        ws.raw,
        (async () => {
          const token = bearer(ws.data.request.headers.get("authorization"));
          const runtime = token ? await runtimesService.authenticate(token) : null;
          if (!runtime) {
            ws.close();
            return undefined;
          }
          return hub.attach(
            runtime.id,
            runtime.organizationId,
            (message) => ws.send(message),
            (code, reason) => ws.close(code, reason),
          );
        })(),
      );
    },
    async message(ws, message) {
      const text = typeof message === "string" ? message : JSON.stringify(message);
      await (await attaching.get(ws.raw))?.receive(text);
    },
    async close(ws) {
      const connection = await attaching.get(ws.raw);
      attaching.delete(ws.raw);
      if (!connection) return;
      connection.close();
      // The last time it was seen is when it left.
      void runtimesService.touch(connection.runtimeId);
    },
  });
};
