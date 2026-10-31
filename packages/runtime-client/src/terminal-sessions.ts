import { errorMessage } from "@aven/agents/values";
import { encodeViewerFrame } from "@aven/protocol/viewer-frame";

import type { ViewerLink } from "./desktop-viewers";
import type { ThreadWorkspaces } from "./sandbox";

type Session = {
  threadId: string;
  proc: Bun.Subprocess;
  /** Ends the shell inside the container, whatever became of the `docker exec` that runs it. */
  hangup: string[];
  /** Keystrokes the terminal did not take yet, in order. */
  unwritten: Uint8Array[];
  closing: boolean;
};

const MAX_COLS = 500;
const MAX_ROWS = 200;
// A terminal cannot be paused, so one that writes this much faster than the link carries it (a
// runaway `yes`) is ended instead of filling memory.
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
// A paste that the terminal does not take is held; this much at most.
const MAX_UNWRITTEN_BYTES = 1024 * 1024;

const NOT_RUNNING = "The sandbox is not running";

const clamp = (value: number, max: number) => Math.min(max, Math.max(1, Math.trunc(value) || 1));

// The shells of this runner's sandboxes, on pseudo-terminals the control plane opens for people
// (decision 0053). Like watching a desktop, opening one never starts a sandbox: a thread whose
// container is not running has no shell, until the runner is asked to wake it (decision 0039).
export class TerminalSessions {
  #sessions = new Map<string, Session>();

  constructor(
    private sandbox: ThreadWorkspaces,
    private link: ViewerLink,
  ) {}

  /** How many terminals are open on the thread; an open terminal is not idle. */
  count(threadId: string) {
    return [...this.#sessions.values()].filter((session) => session.threadId === threadId).length;
  }

  has(viewerId: string) {
    return this.#sessions.has(viewerId);
  }

  open(viewerId: string, threadId: string, size: { cols: number; rows: number }) {
    const shell = this.sandbox.shell?.(threadId, viewerId);
    if (!shell) return this.#refuse(viewerId, NOT_RUNNING);
    let session: Session | undefined;
    try {
      const proc = Bun.spawn(shell.argv, {
        env: shell.env,
        terminal: {
          cols: clamp(size.cols, MAX_COLS),
          rows: clamp(size.rows, MAX_ROWS),
          data: (_terminal, chunk) => {
            if (!session || session.closing) return;
            if (this.link.buffered() > MAX_BUFFERED_BYTES) {
              this.#end(viewerId, session, "The terminal's output was too fast to carry");
              return;
            }
            this.link.sendBinary(encodeViewerFrame(viewerId, chunk));
          },
          drain: () => session && this.#flush(session),
        },
      });
      session = { threadId, proc, hangup: shell.hangup, unwritten: [], closing: false };
    } catch (error) {
      return this.#refuse(viewerId, errorMessage(error));
    }
    const opened = session;
    this.#sessions.set(viewerId, opened);
    this.link.send({ type: "terminal.opened", viewerId });
    void opened.proc.exited.then(() => this.#end(viewerId, opened, "The shell ended"));
  }

  // Keystrokes from the browser. Dropped for a terminal that is gone.
  write(viewerId: string, bytes: Uint8Array) {
    const session = this.#sessions.get(viewerId);
    if (!session) return;
    const held = session.unwritten.reduce((sum, chunk) => sum + chunk.length, 0);
    if (held + bytes.length > MAX_UNWRITTEN_BYTES) return;
    session.unwritten.push(bytes.slice());
    this.#flush(session);
  }

  resize(viewerId: string, cols: number, rows: number) {
    this.#sessions
      .get(viewerId)
      ?.proc.terminal?.resize(clamp(cols, MAX_COLS), clamp(rows, MAX_ROWS));
  }

  close(viewerId: string) {
    const session = this.#sessions.get(viewerId);
    if (!session) return;
    this.#stop(viewerId, session);
  }

  closeAll() {
    for (const viewerId of this.#sessions.keys()) this.close(viewerId);
  }

  // Hands the terminal what it will take; the rest waits for its `drain`.
  #flush(session: Session) {
    const terminal = session.proc.terminal;
    while (terminal && !terminal.closed && session.unwritten.length > 0) {
      const chunk = session.unwritten[0]!;
      const taken = terminal.write(chunk);
      if (taken >= chunk.length) session.unwritten.shift();
      else {
        session.unwritten[0] = chunk.subarray(taken);
        return;
      }
    }
  }

  #stop(viewerId: string, session: Session) {
    session.closing = true;
    this.#sessions.delete(viewerId);
    session.proc.kill();
    session.proc.terminal?.close();
    // Killing the client leaves the shell running in the container. Best effort: a container that
    // is gone has nothing to end.
    Bun.spawn(session.hangup, { stdout: "ignore", stderr: "ignore" }).exited.catch(() => undefined);
  }

  // The shell exited or was cut off; a terminal the control plane closed is already gone.
  #end(viewerId: string, session: Session, reason: string) {
    if (this.#sessions.get(viewerId) !== session) return;
    this.#stop(viewerId, session);
    this.link.send({ type: "terminal.closed", viewerId, reason });
  }

  #refuse(viewerId: string, reason: string) {
    this.link.send({ type: "terminal.closed", viewerId, reason });
  }
}
