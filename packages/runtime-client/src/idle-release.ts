import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";

/** How long an archived thread's sandbox waits for the run that was just stopped to let go of it. */
const RELEASE_WAIT_MS = 20_000;
const RELEASE_WAIT_STEP_MS = 200;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

  /**
   * Frees the thread's sandbox now, as an archived thread's is (decision 0118), and says whether one
   * was up. A run that was just stopped may still be letting go of it: this waits for that, and
   * after `waitMs` leaves the sandbox to its idle release.
   */
  async releaseNow(threadId: string, waitMs = RELEASE_WAIT_MS): Promise<boolean> {
    clearTimeout(this.#timers.get(threadId));
    this.#timers.delete(threadId);
    await this.#releasing.get(threadId);
    while (this.context.hasRun(threadId)) {
      if (this.context.stopped() || waitMs <= 0) {
        // Still working: it goes when it ends, on the clock its run's end starts.
        this.schedule(threadId);
        return false;
      }
      await sleep(RELEASE_WAIT_STEP_MS);
      waitMs -= RELEASE_WAIT_STEP_MS;
    }
    if (this.context.stopped() || !this.context.boxes.has(threadId)) return false;
    let released = true;
    const release = this.#free(threadId)
      .catch((error: unknown) => {
        released = false;
        console.error(`Could not release thread ${threadId}:`, error);
      })
      .finally(() => this.#releasing.delete(threadId));
    this.#releasing.set(threadId, release);
    await release;
    return released;
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
