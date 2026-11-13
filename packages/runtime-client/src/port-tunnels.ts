import type { Socket } from "bun";

import { errorMessage } from "@aven/agents/values";
import { previewPortRefusal } from "@aven/protocol/preview";
import { encodeViewerFrame } from "@aven/protocol/viewer-frame";

import type { ViewerLink } from "./types";

type Tunnel = {
  socket: Socket<Tunnel> | undefined;
  unwritten: Uint8Array[];
  unwrittenBytes: number;
  closing: boolean;
};

const LOOPBACK = "127.0.0.1";
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const MAX_UNWRITTEN_BYTES = 8 * 1024 * 1024;

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
      unwritten: [],
      unwrittenBytes: 0,
      closing: false,
    };
    this.#tunnels.set(viewerId, tunnel);

    try {
      tunnel.socket = await Bun.connect<Tunnel>({
        hostname: LOOPBACK,
        port,
        socket: {
          data: (_socket, bytes) => this.#fromPort(viewerId, tunnel, bytes),
          drain: () => this.#flush(tunnel),
          close: () => this.#end(viewerId, tunnel, "The port closed the connection"),
          error: (_socket, error) => this.#end(viewerId, tunnel, errorMessage(error)),
        },
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

    if (tunnel.unwrittenBytes + bytes.length > MAX_UNWRITTEN_BYTES) {
      this.#end(viewerId, tunnel, "The preview sent too much to carry");
      return;
    }

    tunnel.unwritten.push(bytes.slice());
    tunnel.unwrittenBytes += bytes.length;
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

    while (socket && tunnel.unwritten.length > 0) {
      const chunk = tunnel.unwritten[0]!;
      const taken = socket.write(chunk);

      if (taken < chunk.length) {
        tunnel.unwritten[0] = chunk.subarray(taken);
        tunnel.unwrittenBytes -= taken;
        return;
      }

      tunnel.unwritten.shift();
      tunnel.unwrittenBytes -= chunk.length;
    }
  }

  #fromPort(viewerId: string, tunnel: Tunnel, bytes: Uint8Array) {
    if (tunnel.closing || this.#tunnels.get(viewerId) !== tunnel) return;

    if (this.link.buffered() > MAX_BUFFERED_BYTES) {
      this.#end(viewerId, tunnel, "The preview was too slow to carry");
      return;
    }

    this.link.sendBinary(encodeViewerFrame(viewerId, bytes));
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
