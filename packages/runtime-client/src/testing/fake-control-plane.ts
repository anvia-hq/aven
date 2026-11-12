import type { RuntimeToControlPlane } from "@aven/protocol/types";
import type { FakeControlPlaneOptions } from "../types";

export function fakeControlPlane(options: FakeControlPlaneOptions = {}) {
  const transcripts = { stored: options.storesTranscripts !== false };
  const received: RuntimeToControlPlane[] = [];
  const receivedBinary: Uint8Array[] = [];
  let client: { send(data: string | Uint8Array): void; close(): void } | undefined;
  const opened = Promise.withResolvers<void>();
  const server = Bun.serve({
    port: 0,
    fetch: (request, srv) =>
      srv.upgrade(request) ? undefined : new Response("no", { status: 400 }),
    websocket: {
      open(ws) {
        client = ws;
        opened.resolve();
      },
      message(ws, data) {
        if (typeof data !== "string") {
          receivedBinary.push(new Uint8Array(data));
          return;
        }

        const message = JSON.parse(data) as RuntimeToControlPlane;
        received.push(message);

        if (message.type === "call" && message.method === "memory.append" && transcripts.stored)
          ws.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result: null }));

        if (message.type === "call" && options.answer) {
          const result = options.answer(message);

          if (result !== undefined) {
            ws.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result }));
          }
        }

        if (message.type === "call" && message.method === "bot.memory") {
          const result = (message.params as { op: string }).op === "load" ? [] : null;
          ws.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result }));
        }
      },
    },
  });
  return {
    url: `ws://localhost:${server.port}`,
    received,
    receivedBinary,
    transcripts,
    opened: opened.promise,
    send: (message: unknown) => client?.send(JSON.stringify(message)),
    drop: () => client?.close(),
    sendBinary: (frame: Uint8Array) => client?.send(frame),
    stop: () => server.stop(true),
  };
}
