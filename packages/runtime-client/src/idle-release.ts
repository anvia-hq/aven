import type { IdleReleaseContext } from "./types";

const RELEASE_WAIT_MS = 20_000;
const RELEASE_WAIT_STEP_MS = 200;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class IdleRelease {
  #timers = new Map<string, Timer>();
  #releasing = new Map<string, Promise<void>>();

  constructor(private context: IdleReleaseContext) {}

  schedule(threadId: string) {
    clearTimeout(this.#timers.get(threadId));
    if (this.context.stopped()) return;
    this.#timers.set(
      threadId,
      setTimeout(() => void this.#releaseIfIdle(threadId), this.context.idleMs),
    );
  }

  async starting(threadId: string) {
    clearTimeout(this.#timers.get(threadId));
    await this.#releasing.get(threadId);
  }

  cancelAll() {
    for (const timer of this.#timers.values()) clearTimeout(timer);
  }

  async releaseNow(threadId: string, waitMs = RELEASE_WAIT_MS): Promise<boolean> {
    clearTimeout(this.#timers.get(threadId));
    this.#timers.delete(threadId);
    await this.#releasing.get(threadId);
    while (this.context.hasRun(threadId)) {
      if (this.context.stopped() || waitMs <= 0) {
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
