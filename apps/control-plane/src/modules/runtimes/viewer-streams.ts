import { type ControlPlaneToRuntime } from "@aven/protocol/runtime-wire";
import { decodeViewerFrame, encodeViewerFrame } from "@aven/protocol/viewer-frame";

import { UnavailableError } from "../../errors";

export type ViewerSink = {
  data(bytes: Uint8Array): void;
  closed(reason: string): void;
};

export type ViewerHandle = {
  write(bytes: Uint8Array): void;
  close(): void;
};

export type TerminalHandle = ViewerHandle & {
  resize(cols: number, rows: number): void;
};

type Viewer = { sink: ViewerSink; ready: boolean; kind: "desktop" | "terminal" };

const MAX_VIEWERS = 32;

export class ViewerStreams {
  #viewers = new Map<string, Viewer>();

  constructor(
    private post: (message: ControlPlaneToRuntime) => void,
    private sendFrame: (frame: Uint8Array) => void,
    private connectionClosed: () => boolean,
  ) {}

  open(threadId: string, sink: ViewerSink): ViewerHandle {
    const viewerId = this.#add("desktop", sink);
    this.post({ type: "desktop.open", viewerId, threadId });
    return this.#handle(viewerId, "desktop.close");
  }

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
      throw new UnavailableError("Too many desktops and terminals are open on this runner");
    }
    const viewerId = crypto.randomUUID();
    this.#viewers.set(viewerId, { sink, ready: false, kind });
    return viewerId;
  }

  #handle(viewerId: string, closeType: "desktop.close" | "terminal.close"): ViewerHandle {
    return {
      write: (bytes) => {
        if (this.#viewers.get(viewerId)?.ready) this.sendFrame(encodeViewerFrame(viewerId, bytes));
      },
      close: () => {
        if (!this.#viewers.delete(viewerId) || this.connectionClosed()) return;
        this.post({ type: closeType, viewerId });
      },
    };
  }

  opened(viewerId: string, kind: Viewer["kind"]) {
    const viewer = this.#viewers.get(viewerId);
    if (viewer?.kind === kind) viewer.ready = true;
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
