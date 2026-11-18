import { describeError } from "@aven/server-kit/errors";

import { eventKey, eventNote } from "./notes";
import type { OfferResult, ThreadEvent } from "./types";

export const EVENT_NOTES_PER_HOUR = 6;
export const EVENT_NOTES_WINDOW_MS = 60 * 60_000;
export const EVENT_NOTES_KEPT_MS = 7 * 24 * 60 * 60_000;

export class ThreadEventNotes {
  #seen = new Map<string, number>();
  #sent = new Map<string, number[]>();

  constructor(
    private tell: (userId: string, note: string) => Promise<void>,
    private now: () => number = Date.now,
  ) {}

  async offer(userId: string, event: ThreadEvent): Promise<OfferResult> {
    const at = this.now();
    this.#forget(at);
    const key = `${userId}:${eventKey(event)}`;

    if (this.#seen.has(key)) return "duplicate";

    const recent = this.#sent.get(userId) ?? [];

    if (recent.length >= EVENT_NOTES_PER_HOUR) return "limited";

    this.#seen.set(key, at);
    this.#sent.set(userId, [...recent, at]);
    try {
      await this.tell(userId, eventNote(event));
      return "sent";
    } catch (error) {
      this.#seen.delete(key);
      this.#sent.set(userId, recent);
      console.warn(`Could not tell a bot about ${eventKey(event)}:`, describeError(error));
      return "failed";
    }
  }

  #forget(at: number) {
    for (const [key, seenAt] of this.#seen) {
      if (at - seenAt >= EVENT_NOTES_KEPT_MS) this.#seen.delete(key);
    }

    for (const [userId, times] of this.#sent) {
      const recent = times.filter((time) => at - time < EVENT_NOTES_WINDOW_MS);

      if (recent.length === 0) this.#sent.delete(userId);
      else this.#sent.set(userId, recent);
    }
  }
}
