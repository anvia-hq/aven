import type { Socket } from "bun";

import { errorMessage } from "@aven/agents/values";
import { previewPortRefusal } from "@aven/protocol/preview";

import { ViewerWriteQueue, forwardViewerChunk } from "./processes/viewer-channel";
import type { ViewerLink } from "./types";

type Tunnel = {
  socket: Socket<Tunnel> | undefined;
  queue: ViewerWriteQueue;
  closing: boolean;
};

const LOOPBACK_HOSTS = ["127.0.0.1", "::1"] as const;
const MAX_UNWRITTEN_BYTES = 8 * 1024 * 1024;

async function connectLoopback(
  port: number,
  handlers: {
    data: (socket: Socket<Tunnel>, bytes: Uint8Array) => void;
    drain: () => void;
    close: () => void;
    error: (error: Error) => void;
  },
): Promise<Socket<Tunnel>> {
  let lastError: unknown;

  for (const hostname of LOOPBACK_HOSTS) {
    let connected = false;
    try {
      return await Bun.connect<Tunnel>({
        hostname,
        port,
        socket: {
          open() {
            connected = true;
          },
          data: (socket, bytes) => handlers.data(socket, bytes),
          drain: () => handlers.drain(),
          close: () => {
            if (connected) handlers.close();
          },
          error: (_socket, error) => {
            if (connected) handlers.error(error);
          },
        },
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export class PortTunnels {
  #tunnels = new Map<string, Tunnel>();

  constructor(private link: ViewerLink) {}

  count() {
    return this.#tunnels.size;
  }

  has(viewerId: string) {
    return this.#tunnels.has(viewerId);
  }

  async open(viewerId: string, port: number) {
    const refusal = previewPortRefusal(port);

    if (refusal) return this.#refuse(viewerId, refusal);

    if (this.#tunnels.has(viewerId)) return this.#refuse(viewerId, "That preview is open already");

    const tunnel: Tunnel = {
      socket: undefined,
      queue: new ViewerWriteQueue(MAX_UNWRITTEN_BYTES),
      closing: false,
    };
    this.#tunnels.set(viewerId, tunnel);

    try {
      tunnel.socket = await connectLoopback(port, {
        data: (_socket, bytes) => this.#fromPort(viewerId, tunnel, bytes),
        drain: () => this.#flush(tunnel),
        close: () => this.#end(viewerId, tunnel, "The port closed the connection"),
        error: (error) => this.#end(viewerId, tunnel, errorMessage(error)),
      });
    } catch (error) {
      this.#tunnels.delete(viewerId);
      return this.#refuse(viewerId, errorMessage(error));
    }

    if (tunnel.closing) {
      tunnel.socket.end();
      return;
    }

    this.#flush(tunnel);
    this.link.send({ type: "port.opened", viewerId });
  }

  write(viewerId: string, bytes: Uint8Array) {
    const tunnel = this.#tunnels.get(viewerId);

    if (!tunnel) return;

    if (!tunnel.queue.push(bytes)) {
      this.#end(viewerId, tunnel, "The preview sent too much to carry");
      return;
    }

    this.#flush(tunnel);
  }

  close(viewerId: string) {
    const tunnel = this.#tunnels.get(viewerId);

    if (!tunnel) return;

    tunnel.closing = true;
    this.#tunnels.delete(viewerId);
    tunnel.socket?.end();
  }

  closeAll() {
    for (const viewerId of this.#tunnels.keys()) this.close(viewerId);
  }

  #flush(tunnel: Tunnel) {
    const socket = tunnel.socket;

    if (!socket) return;

    tunnel.queue.flush((chunk) => socket.write(chunk));
  }

  #fromPort(viewerId: string, tunnel: Tunnel, bytes: Uint8Array) {
    if (tunnel.closing || this.#tunnels.get(viewerId) !== tunnel) return;

    if (!forwardViewerChunk(this.link, viewerId, bytes)) {
      this.#end(viewerId, tunnel, "The preview was too slow to carry");
    }
  }

  #end(viewerId: string, tunnel: Tunnel, reason: string) {
    if (this.#tunnels.get(viewerId) !== tunnel) return;

    tunnel.closing = true;
    this.#tunnels.delete(viewerId);
    tunnel.socket?.end();
    this.link.send({ type: "port.closed", viewerId, reason });
  }

  #refuse(viewerId: string, reason: string) {
    this.link.send({ type: "port.closed", viewerId, reason });
  }
}
