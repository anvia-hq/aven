import { Elysia } from "elysia";

import { bearerToken } from "./bearer";
import type { RuntimeConnection, RuntimeHub } from "./hub";
import { runtimesService } from "./service";

// The socket a runtime opens. It authenticates with its registration token in the Authorization
// header; a revoked or unknown token never upgrades.
export const connectRouter = (hub: RuntimeHub) => {
  const connections = new Map<object, RuntimeConnection>();
  return (
    new Elysia()
      // Checked once, before the upgrade; the runtime found here is what `open` attaches.
      .resolve(async ({ request, status }) => {
        const token = bearerToken(request.headers);
        const runtime = token ? await runtimesService.authenticate(token) : null;
        if (!runtime) return status(401, "Unauthorized");
        return { runtime };
      })
      .ws("/connect", {
        open(ws) {
          const { runtime } = ws.data;
          connections.set(
            ws.raw,
            hub.attach(
              runtime.id,
              runtime.organizationId,
              (message) => ws.send(message),
              (code, reason) => ws.close(code, reason),
            ),
          );
        },
        async message(ws, message) {
          const text = typeof message === "string" ? message : JSON.stringify(message);
          await connections.get(ws.raw)?.receive(text);
        },
        close(ws) {
          const connection = connections.get(ws.raw);
          connections.delete(ws.raw);
          if (!connection) return;
          connection.close();
          // The last time it was seen is when it left.
          void runtimesService.touch(connection.runtimeId);
        },
      })
  );
};
