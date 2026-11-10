import type { SandboxTunnel, TunnelHandle } from "@anvia/sandbox/remote";
import { errorMessage } from "@aven/agents/values";
import { encodeViewerFrame } from "@aven/protocol/viewer-frame";

import type { ThreadWorkspaces, ViewerLink } from "./types";

type Tunnel = {
  threadId: string;
  handle?: TunnelHandle;
  closing: boolean;
};

export const REFUSED_PORTS: readonly number[] = [5900];

const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const DRAIN_POLL_MS = 10;

const NOT_RUNNING = "The sandbox is not running";

export class PortTunnels {
  #tunnels = new Map<string, Tunnel>();

  constructor(
    private sandbox: ThreadWorkspaces,
    private link: ViewerLink,
  ) {}

  count(threadId: string) {
    return [...this.#tunnels.values()].filter((tunnel) => tunnel.threadId === threadId).length;
  }

  has(viewerId: string) {
    return this.#tunnels.has(viewerId);
  }

  async open(viewerId: string, threadId: string, port: number) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return this.#refuse(viewerId, "That is not a port");
    }
    if (REFUSED_PORTS.includes(port)) return this.#refuse(viewerId, "That port is not shown");
    const tunnels: SandboxTunnel | undefined = this.sandbox.tunnel?.(threadId);
    if (!tunnels) return this.#refuse(viewerId, NOT_RUNNING);
    const tunnel: Tunnel = { threadId, closing: false };
    this.#tunnels.set(viewerId, tunnel);
    try {
      tunnel.handle = await tunnels.open(port);
    } catch (error) {
      this.#tunnels.delete(viewerId);
      return this.#refuse(viewerId, errorMessage(error));
    }
    if (tunnel.closing) return tunnel.handle.close();
    this.link.send({ type: "port.opened", viewerId });
    void this.#pump(viewerId, tunnel, tunnel.handle);
  }

  write(viewerId: string, bytes: Uint8Array) {
    const tunnel = this.#tunnels.get(viewerId);
    tunnel?.handle?.write(bytes).catch(() => this.#end(viewerId, "The port closed the connection"));
  }

  close(viewerId: string) {
    const tunnel = this.#tunnels.get(viewerId);
    if (!tunnel) return;
    tunnel.closing = true;
    this.#tunnels.delete(viewerId);
    tunnel.handle?.close();
  }

  closeAll() {
    for (const viewerId of this.#tunnels.keys()) this.close(viewerId);
  }

  async #pump(viewerId: string, tunnel: Tunnel, handle: TunnelHandle) {
    for await (const chunk of handle.output) {
      while (this.link.buffered() > MAX_BUFFERED_BYTES && !tunnel.closing) {
        await Bun.sleep(DRAIN_POLL_MS);
      }
      if (tunnel.closing) return;
      this.link.sendBinary(encodeViewerFrame(viewerId, chunk));
    }
    this.#end(viewerId, "The port closed the connection");
  }

  #end(viewerId: string, reason: string) {
    if (!this.#tunnels.delete(viewerId)) return;
    this.link.send({ type: "port.closed", viewerId, reason });
  }

  #refuse(viewerId: string, reason: string) {
    this.link.send({ type: "port.closed", viewerId, reason });
  }
}
