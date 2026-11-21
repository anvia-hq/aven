import { SHELL_ENDED } from "@aven/protocol/terminal";
import { errorMessage } from "@aven/agents/values";

import { ViewerWriteQueue, forwardViewerChunk } from "./viewer-channel";
import type { ThreadWorkspaces, ViewerLink } from "../types";

type Session = {
  threadId: string;
  proc: Bun.Subprocess;
  hangup: string[];
  queue: ViewerWriteQueue;
  closing: boolean;
};

const MAX_COLS = 500;
const MAX_ROWS = 200;
const MAX_UNWRITTEN_BYTES = 1024 * 1024;

const NOT_RUNNING = "The sandbox is not running";

const clamp = (value: number, max: number) => Math.min(max, Math.max(1, Math.trunc(value) || 1));

export class TerminalSessions {
  #sessions = new Map<string, Session>();

  constructor(
    private sandbox: ThreadWorkspaces,
    private link: ViewerLink,
  ) {}

  count(threadId: string) {
    return [...this.#sessions.values()].filter((session) => session.threadId === threadId).length;
  }

  has(viewerId: string) {
    return this.#sessions.has(viewerId);
  }

  open(viewerId: string, threadId: string, size: { cols: number; rows: number }) {
    if (this.#sessions.has(viewerId)) {
      return this.#refuse(viewerId, "That terminal is open already");
    }

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

            if (!forwardViewerChunk(this.link, viewerId, chunk)) {
              this.#end(viewerId, session, "The terminal's output was too fast to carry");
            }
          },
          drain: () => session && this.#flush(session),
        },
      });
      session = {
        threadId,
        proc,
        hangup: shell.hangup,
        queue: new ViewerWriteQueue(MAX_UNWRITTEN_BYTES),
        closing: false,
      };
    } catch (error) {
      return this.#refuse(viewerId, errorMessage(error));
    }
    const opened = session;
    this.#sessions.set(viewerId, opened);
    this.link.send({ type: "terminal.opened", viewerId });
    void opened.proc.exited.then(() => this.#end(viewerId, opened, SHELL_ENDED));
  }

  write(viewerId: string, bytes: Uint8Array) {
    const session = this.#sessions.get(viewerId);

    if (!session || !session.queue.push(bytes)) return;

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

  #flush(session: Session) {
    const terminal = session.proc.terminal;

    if (!terminal || terminal.closed) return;

    session.queue.flush((chunk) => terminal.write(chunk));
  }

  #stop(viewerId: string, session: Session) {
    session.closing = true;
    this.#sessions.delete(viewerId);
    session.proc.kill();
    session.proc.terminal?.close();
    Bun.spawn(session.hangup, { stdout: "ignore", stderr: "ignore" }).exited.catch(() => undefined);
  }

  #end(viewerId: string, session: Session, reason: string) {
    if (this.#sessions.get(viewerId) !== session) return;

    this.#stop(viewerId, session);
    this.link.send({ type: "terminal.closed", viewerId, reason });
  }

  #refuse(viewerId: string, reason: string) {
    this.link.send({ type: "terminal.closed", viewerId, reason });
  }
}
