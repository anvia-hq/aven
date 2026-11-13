import { CloseCode } from "@aven/protocol/runtime-wire";
import { Elysia } from "elysia";

import { bytesOf } from "@aven/server-kit/bytes";
import { bearerToken } from "./bearer";
import type { RuntimeConnection, RuntimeHub } from "./hub";
import { runtimesService } from "./service";

export const connectRouter = (hub: RuntimeHub) => {
  const connections = new Map<object, RuntimeConnection>();
  return new Elysia()
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
          (message) => ws.raw.send(message),
          (code, reason) => ws.close(code, reason),
        );
        connections.set(ws.raw, connection);
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
        void runtimesService.touch(connection.runtimeId);
      },
    });
};
