import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

export type IdleReleaseContext = {
  sandbox: Pick<ThreadWorkspaces, "release">;
  /** The sandboxes of the threads that have one; a released thread's is dropped from it. */
  boxes: Map<string, ThreadSandbox>;
  /** A thread with no use for this long gives up its sandbox (its files stay). */
  idleMs: number;
  /** The runner is shutting down: nothing more is scheduled or released. */
  stopped(): boolean;
  /** A run or a bot's reply is using the thread's sandbox. */
  hasRun(threadId: string): boolean;
  /** Someone is watching the thread's desktop or has a terminal open on it. */
  isWatched(threadId: string): boolean;
};

// Frees a thread's sandbox once nothing has used it for a while. A run, a viewer or a process the
// agent left running (a dev server) keeps it; the check comes round again after another idle period.
export class IdleRelease {
  #timers = new Map<string, Timer>();
  #releasing = new Map<string, Promise<void>>();

  constructor(private context: IdleReleaseContext) {}

  /** Starts the thread's idle clock again, after a run or a reply, or a sandbox that was woken. */
  schedule(threadId: string) {
    clearTimeout(this.#timers.get(threadId));
    if (this.context.stopped()) return;
    this.#timers.set(
      threadId,
      setTimeout(() => void this.#releaseIfIdle(threadId), this.context.idleMs),
    );
  }

  /** Something is about to use the thread's sandbox: it must not be released as idle. */
  async starting(threadId: string) {
    clearTimeout(this.#timers.get(threadId));
    await this.#releasing.get(threadId);
  }

  /** Stops every idle clock, for a runner that is shutting down. */
  cancelAll() {
    for (const timer of this.#timers.values()) clearTimeout(timer);
  }

  /** Resolves once the releases in progress are done. */
  async settled() {
    await Promise.all(this.#releasing.values());
  }

  async #releaseIfIdle(threadId: string) {
    const { context } = this;
    this.#timers.delete(threadId);
    if (context.stopped() || context.hasRun(threadId)) return;
    const busy =
      context.isWatched(threadId) ||
      (await context.boxes
        .get(threadId)
        ?.hasRunningProcesses()
        .catch(() => false));
    if (context.stopped() || context.hasRun(threadId)) return;
    if (busy) {
      this.schedule(threadId);
      return;
    }
    const release = this.#free(threadId)
      .catch((error: unknown) => console.error(`Could not release thread ${threadId}:`, error))
      .finally(() => this.#releasing.delete(threadId));
    this.#releasing.set(threadId, release);
  }

  async #free(threadId: string) {
    this.context.boxes.delete(threadId);
    await this.context.sandbox.release(threadId);
  }
}
