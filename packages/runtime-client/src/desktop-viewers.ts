import type { SandboxDesktop } from "@anvia/sandbox";
import {
  encodeViewerFrame,
  type DesktopCallMethod,
  type DesktopInfo,
  type RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

import type { ThreadWorkspaces } from "./sandbox";

type Tunnel = Awaited<ReturnType<SandboxDesktop["openViewer"]>>;

/** How the viewers reach the control plane. */
export type ViewerLink = {
  send(message: RuntimeToControlPlane): void;
  sendBinary(frame: Uint8Array): void;
  /** Bytes queued on the link and not yet sent. */
  buffered(): number;
};

type Viewer = {
  threadId: string;
  /** Not there until the desktop has answered `openViewer`. */
  tunnel?: Tunnel;
  closing: boolean;
};

// Stop reading the desktop's stream while this much is waiting to go out, so a slow link slows
// the desktop instead of filling memory.
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const DRAIN_POLL_MS = 10;

const NOT_RUNNING = "The thread's sandbox is not running";

type ThreadCall = { threadId: string; holder?: string; leaseMs?: number; force?: boolean };

function threadCall(params: unknown): ThreadCall {
  if (typeof params !== "object" || params === null) throw new Error("Invalid parameters");
  const { threadId, holder, leaseMs, force } = params as Record<string, unknown>;
  if (typeof threadId !== "string") throw new Error("Invalid parameters");
  return {
    threadId,
    holder: typeof holder === "string" ? holder : undefined,
    leaseMs: typeof leaseMs === "number" ? leaseMs : undefined,
    force: force === true,
  };
}

// The desktops of this runner's sandboxes, streamed to viewers the control plane opens (decision
// 0015). It never starts a sandbox: a thread whose container is not running has no desktop to see.
export class DesktopViewers {
  #viewers = new Map<string, Viewer>();

  constructor(
    private sandbox: ThreadWorkspaces,
    private link: ViewerLink,
  ) {}

  /** How many viewers are watching the thread; a watched sandbox is not idle. */
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
      return this.#refuse(viewerId, error instanceof Error ? error.message : String(error));
    }
    if (viewer.closing) return viewer.tunnel.close();
    this.link.send({ type: "desktop.opened", viewerId });
    void this.#pump(viewerId, viewer, viewer.tunnel);
  }

  // Bytes from the browser's viewer for the desktop. Dropped until the desktop has answered.
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

  /** The control plane's calls about a thread's desktop; null when its sandbox is not running. */
  async call(method: DesktopCallMethod, params: unknown) {
    const { threadId, holder, leaseMs, force } = threadCall(params);
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

  // The desktop ended the stream; a viewer the control plane closed is already gone.
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
