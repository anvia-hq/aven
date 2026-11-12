import { connect } from "node:net";
import { once } from "node:events";

import { createFrameReader, encodeFrame } from "./codex-mcp";

export async function forwardMcp(socketPath: string) {
  const socket = connect(socketPath);
  await once(socket, "connect");
  const toParent = (message: unknown) => socket.write(encodeFrame(message));
  const toChild = (message: unknown) => process.stdout.write(encodeFrame(message));
  const fromChild = createFrameReader(toParent);
  const fromParent = createFrameReader(toChild);
  process.stdin.on("data", (chunk: Buffer) => fromChild(Buffer.from(chunk)));
  socket.on("data", (chunk) => fromParent(Buffer.from(chunk)));
  await Promise.race([once(socket, "close"), once(process.stdin, "end")]);
  socket.destroy();
}

if (import.meta.main) {
  const socketPath = process.argv[2] ?? "";
  await forwardMcp(socketPath);
}
