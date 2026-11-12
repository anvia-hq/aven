import { describeError } from "../../errors";
import type { RunOutcome } from "@aven/protocol/types";
import type { RuntimeConnection } from "./hub";

const WATCH_TIMEOUT_MS = 10_000;

type Phase = "settle" | "suspend";

type WatchCaller = Pick<RuntimeConnection, "call">;

export class MachineProcessWatch {
  #pending = new Map<string, Map<string, Phase>>();
  #old = new Set<string>();
  #tail = new Map<string, Promise<void>>();

  constructor(private caller: (runtimeId: string) => WatchCaller | undefined) {}

  ended(machineId: string | undefined, threadId: string, outcome: RunOutcome | "lost") {
    if (!machineId) return Promise.resolve();

    const phase: Phase = outcome === "response" ? "settle" : "suspend";
    return this.#enqueue(machineId, () => this.#deliver(machineId, threadId, phase));
  }

  hello(
    machineId: string,
    guests: readonly string[] = [],
    live: (threadId: string) => boolean | undefined = () => undefined,
  ) {
    this.#old.delete(machineId);
    return this.#enqueue(machineId, async () => {
      const pending = this.#pending.get(machineId) ?? new Map<string, Phase>();
      this.#pending.delete(machineId);
      for (const threadId of guests) {
        if (!pending.has(threadId) && live(threadId) === false) pending.set(threadId, "suspend");
      }
      for (const [threadId, phase] of pending) await this.#deliver(machineId, threadId, phase);
    });
  }

  #enqueue(machineId: string, work: () => Promise<void>) {
    const previous = this.#tail.get(machineId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(work)
      .catch((error: unknown) => {
        console.warn(`Could not update a process watch:`, describeError(error));
      });
    this.#tail.set(machineId, next);
    void next.finally(() => {
      if (this.#tail.get(machineId) === next) this.#tail.delete(machineId);
    });
    return next;
  }

  async #deliver(machineId: string, threadId: string, phase: Phase) {
    if (this.#old.has(machineId)) return;

    const connection = this.caller(machineId);

    if (!connection) {
      this.#keep(machineId, threadId, phase);
      return;
    }

    try {
      await connection.call("process.watch", { threadId, phase }, WATCH_TIMEOUT_MS);
    } catch (error) {
      if (!this.caller(machineId)) {
        this.#keep(machineId, threadId, phase);
        return;
      }

      if (/unknown call/i.test(describeError(error))) {
        this.#old.add(machineId);
        console.warn(
          `Runtime ${machineId} cannot watch the processes of a thread that runs elsewhere: its runner needs updating.`,
        );
        return;
      }

      console.warn(`Could not ${phase} the process watch for ${threadId}:`, describeError(error));
    }
  }

  #keep(machineId: string, threadId: string, phase: Phase) {
    const queued = this.#pending.get(machineId) ?? new Map<string, Phase>();
    queued.set(threadId, phase);
    this.#pending.set(machineId, queued);
  }
}
