import type { SandboxDesktop } from "@anvia/sandbox";
import { errorMessage } from "@aven/agents/values";
import {
  type DesktopCallMethod,
  type DesktopInfo,
  type RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";
import { encodeViewerFrame } from "@aven/protocol/viewer-frame";

import { desktopCallParams } from "./call-params";
import type { ThreadWorkspaces } from "./sandbox";

type Tunnel = Awaited<ReturnType<SandboxDesktop["openViewer"]>>;

export type ViewerLink = {
  send(message: RuntimeToControlPlane): void;
  sendBinary(frame: Uint8Array): void;
  buffered(): number;
};

type Viewer = {
  threadId: string;
  tunnel?: Tunnel;
  closing: boolean;
};

const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const DRAIN_POLL_MS = 10;

const NOT_RUNNING = "The sandbox is not running";

export class DesktopViewers {
  #viewers = new Map<string, Viewer>();

  constructor(
    private sandbox: ThreadWorkspaces,
    private link: ViewerLink,
  ) {}

  watching(threadId: string) {
    return [...this.#viewers.values()].filter((viewer) => viewer.threadId === threadId).length;
  }

  async open(viewerId: string, threadId: string) {
    const desktop = this.sandbox.desktop(threadId);
    if (!desktop) return this.#refuse(viewerId, NOT_RUNNING);
    const viewer: Viewer = { threadId, closing: false };
    this.#viewers.set(viewerId, viewer);
    try {
      viewer.tunnel = await desktop.openViewer();
    } catch (error) {
      this.#viewers.delete(viewerId);
      return this.#refuse(viewerId, errorMessage(error));
    }
    if (viewer.closing) return viewer.tunnel.close();
    this.link.send({ type: "desktop.opened", viewerId });
    void this.#pump(viewerId, viewer, viewer.tunnel);
  }

  write(viewerId: string, bytes: Uint8Array) {
    const viewer = this.#viewers.get(viewerId);
    viewer?.tunnel?.write(bytes).catch(() => this.#end(viewerId, "The desktop connection ended"));
  }

  close(viewerId: string) {
    const viewer = this.#viewers.get(viewerId);
    if (!viewer) return;
    viewer.closing = true;
    this.#viewers.delete(viewerId);
    viewer.tunnel?.close();
  }

  closeAll() {
    for (const viewerId of this.#viewers.keys()) this.close(viewerId);
  }

  async call(method: Exclude<DesktopCallMethod, "desktop.wake">, params: unknown) {
    const { threadId, holder, leaseMs, force } = desktopCallParams(params);
    const desktop = this.sandbox.desktop(threadId);
    if (!desktop) return null;
    switch (method) {
      case "desktop.status":
        return toInfo(await desktop.status());
      case "desktop.takeover":
        if (!holder) throw new Error("Invalid parameters");
        return desktop.takeover({ holder, leaseMs });
      case "desktop.release":
        return desktop.release({ holder, force });
    }
  }

  async #pump(viewerId: string, viewer: Viewer, tunnel: Tunnel) {
    for await (const chunk of tunnel.output) {
      while (this.link.buffered() > MAX_BUFFERED_BYTES && !viewer.closing) {
        await Bun.sleep(DRAIN_POLL_MS);
      }
      if (viewer.closing) return;
      this.link.sendBinary(encodeViewerFrame(viewerId, chunk));
    }
    this.#end(viewerId, "The desktop connection ended");
  }

  #end(viewerId: string, reason: string) {
    if (!this.#viewers.delete(viewerId)) return;
    this.link.send({ type: "desktop.closed", viewerId, reason });
  }

  #refuse(viewerId: string, reason: string) {
    this.link.send({ type: "desktop.closed", viewerId, reason });
  }
}

function toInfo(status: Awaited<ReturnType<SandboxDesktop["status"]>>): DesktopInfo {
  const { state, width, height, control } = status;
  return { state, width, height, control };
}
