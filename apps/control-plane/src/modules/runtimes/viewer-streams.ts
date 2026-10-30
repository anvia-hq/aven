import {
  decodeViewerFrame,
  encodeViewerFrame,
  type ControlPlaneToRuntime,
} from "@aven/protocol/runtime-wire";

import { UnavailableError } from "../../errors";

/** What a viewer's stream reports to whoever opened it (decision 0015). */
export type ViewerSink = {
  data(bytes: Uint8Array): void;
  /** The viewer ended or could not start, or the connection dropped; `reason` says why. */
  closed(reason: string): void;
};

export type ViewerHandle = {
  /** The browser's bytes for the desktop; dropped until the stream has opened. */
  write(bytes: Uint8Array): void;
  close(): void;
};

type Viewer = { sink: ViewerSink; ready: boolean };

// Each viewer is a connection into a sandbox, so a runner is asked for only so many at once.
const MAX_VIEWERS = 32;

// The desktops a runtime is streaming over one connection, by viewer id.
export class ViewerStreams {
  #viewers = new Map<string, Viewer>();

  constructor(
    private post: (message: ControlPlaneToRuntime) => void,
    private sendFrame: (frame: Uint8Array) => void,
    private connectionClosed: () => boolean,
  ) {}

  // Starts streaming a thread's desktop. Throws when the runtime is offline; whether the thread has
  // a running sandbox is the runtime's answer, through `sink.closed`.
  open(threadId: string, sink: ViewerSink): ViewerHandle {
    if (this.#viewers.size >= MAX_VIEWERS) {
      throw new UnavailableError("Too many desktops are open on this runner");
    }
    const viewerId = crypto.randomUUID();
    this.post({ type: "desktop.open", viewerId, threadId });
    this.#viewers.set(viewerId, { sink, ready: false });
    return {
      write: (bytes) => {
        if (this.#viewers.get(viewerId)?.ready) this.sendFrame(encodeViewerFrame(viewerId, bytes));
      },
      close: () => {
        if (!this.#viewers.delete(viewerId) || this.connectionClosed()) return;
        this.post({ type: "desktop.close", viewerId });
      },
    };
  }

  /** The viewer is streaming; its bytes may flow both ways. */
  opened(viewerId: string) {
    const viewer = this.#viewers.get(viewerId);
    if (!viewer) return;
    viewer.ready = true;
  }

  closed(viewerId: string, reason: string) {
    const viewer = this.#viewers.get(viewerId);
    if (!this.#viewers.delete(viewerId)) return;
    viewer?.sink.closed(reason);
  }

  // A binary frame from the runtime. Only a viewer this connection opened is heard.
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
