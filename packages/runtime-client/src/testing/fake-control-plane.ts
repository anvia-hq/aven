import type { RuntimeToControlPlane } from "@aven/protocol/runtime-wire";

// A control plane that records what the runtime sends and lets the test send frames back.
export function fakeControlPlane(options: { storesTranscripts?: boolean } = {}) {
  // Whether the transcript the runner sends home is taken; a test can change it as it goes.
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
        // The transcript the runner sends home is taken, unless a test says otherwise.
        if (message.type === "call" && message.method === "memory.append" && transcripts.stored)
          ws.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result: null }));
        // A bot's conversation: nothing said before, and whatever is added is taken.
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
