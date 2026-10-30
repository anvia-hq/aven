import { CloseCode } from "@aven/protocol/runtime-wire";
import { Elysia } from "elysia";

import { bytesOf } from "../../bytes";
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
          const connection = hub.attach(
            runtime.id,
            // Elysia would encode a Uint8Array as JSON text; the native socket sends bytes as bytes.
            (message) => ws.raw.send(message),
            (code, reason) => ws.close(code, reason),
          );
          connections.set(ws.raw, connection);
          // A revoke or rotation that landed after the check above found nothing to cut off.
          runtimesService.stillCurrent(runtime).then(
            (current) => {
              if (!current) connection.close(CloseCode.Revoked, "Revoked or token rotated");
            },
            (error: unknown) => {
              console.warn(`Could not re-check runtime ${runtime.id}:`, error);
              connection.close(1011, "Could not verify the runtime");
            },
          );
        },
        async message(ws, message) {
          const connection = connections.get(ws.raw);
          // Binary frames carry a viewer's VNC bytes; anything else is JSON, which Elysia may
          // already have parsed.
          if (ArrayBuffer.isView(message)) {
            connection?.receiveBinary(bytesOf(message));
            return;
          }
          const text = typeof message === "string" ? message : JSON.stringify(message);
          await connection?.receive(text);
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
