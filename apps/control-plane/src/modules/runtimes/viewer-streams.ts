import { decodeViewerFrame, encodeViewerFrame } from "@aven/protocol/viewer-frame";

import { UnavailableError } from "../../errors";
import type { TerminalHandle, ViewerHandle, ViewerSink } from "./types";
import type { ControlPlaneToRuntime } from "@aven/protocol/types";

type Viewer = {
  sink: ViewerSink;
  ready: boolean;
  kind: "terminal";
  waiting: Uint8Array[];
  waitingBytes: number;
};

const MAX_VIEWERS = 32;

export class ViewerStreams {
  #viewers = new Map<string, Viewer>();

  constructor(
    private post: (message: ControlPlaneToRuntime) => void,
    private sendFrame: (frame: Uint8Array) => void,
    private connectionClosed: () => boolean,
  ) {}

  openTerminal(
    threadId: string,
    size: { cols: number; rows: number },
    sink: ViewerSink,
  ): TerminalHandle {
    const viewerId = this.#add("terminal", sink);
    this.post({ type: "terminal.open", viewerId, threadId, ...size });
    return {
      ...this.#handle(viewerId, "terminal.close"),
      resize: (cols, rows) => {
        if (this.#viewers.get(viewerId)?.ready) {
          this.post({ type: "terminal.resize", viewerId, cols, rows });
        }
      },
    };
  }

  #add(kind: Viewer["kind"], sink: ViewerSink) {
    if (this.#viewers.size >= MAX_VIEWERS) {
      throw new UnavailableError("Too many terminals are open on this runner");
    }
    const viewerId = crypto.randomUUID();
    this.#viewers.set(viewerId, { sink, ready: false, kind, waiting: [], waitingBytes: 0 });
    return viewerId;
  }

  #handle(viewerId: string, closeType: "terminal.close"): ViewerHandle {
    return {
      write: (bytes) => {
        const viewer = this.#viewers.get(viewerId);
        if (!viewer) return;
        if (viewer.ready) this.sendFrame(encodeViewerFrame(viewerId, bytes));
      },
      close: () => {
        if (!this.#viewers.delete(viewerId) || this.connectionClosed()) return;
        this.post({ type: closeType, viewerId });
      },
    };
  }

  opened(viewerId: string, kind: Viewer["kind"]) {
    const viewer = this.#viewers.get(viewerId);
    if (viewer?.kind !== kind) return;
    viewer.ready = true;
    for (const bytes of viewer.waiting) this.sendFrame(encodeViewerFrame(viewerId, bytes));
    viewer.waiting = [];
    viewer.waitingBytes = 0;
  }

  closed(viewerId: string, kind: Viewer["kind"], reason: string) {
    const viewer = this.#viewers.get(viewerId);
    if (viewer?.kind !== kind) return;
    this.#viewers.delete(viewerId);
    viewer.sink.closed(reason);
  }

  receive(frame: Uint8Array) {
    const decoded = decodeViewerFrame(frame);
    if (!decoded) return;
    const viewer = this.#viewers.get(decoded.viewerId);
    if (viewer?.ready) viewer.sink.data(decoded.payload);
  }

  closeAll(reason: string) {
    const viewers = [...this.#viewers.values()];
    this.#viewers.clear();
    for (const viewer of viewers) viewer.sink.closed(reason);
  }
}
