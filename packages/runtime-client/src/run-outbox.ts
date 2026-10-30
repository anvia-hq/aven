import type { RuntimeToControlPlane } from "@aven/protocol/runtime-wire";

type Entry = { seq: number; message: RuntimeToControlPlane };

type Log = {
  entries: Entry[];
  next: number;
  /** Whether the control plane has asked for this run since the connection came up. */
  attached: boolean;
};

// The most a run keeps for a reconnect. A run that outgrows it while the link is down cannot be
// replayed from the start; the newest events are what a client needs.
const MAX_ENTRIES = 20_000;

// What a run has told the control plane, numbered, until the control plane says it has the end. A
// run keeps working while the link is down; when it comes back the control plane asks for
// everything after the last event it heard (decision 0023).
export class RunOutbox {
  #logs = new Map<string, Log>();

  /** Starts a run's log, already attached: it began on the connection that is up. */
  open(runId: string) {
    this.#logs.set(runId, { entries: [], next: 1, attached: true });
  }

  /** Numbers and keeps a message of the run; null when the run is not in the outbox (it was forgotten). */
  push(runId: string, make: (seq: number) => RuntimeToControlPlane) {
    const log = this.#logs.get(runId);
    if (!log) return null;
    const entry = { seq: log.next++, message: make(log.next - 1) };
    log.entries.push(entry);
    if (log.entries.length > MAX_ENTRIES) log.entries.shift();
    return entry.message;
  }

  /** Whether live messages of the run may be sent now, or are waiting for the control plane to ask. */
  attached(runId: string) {
    return this.#logs.get(runId)?.attached ?? false;
  }

  /** The connection dropped and came back: every run waits to be asked for again. */
  detachAll() {
    for (const log of this.#logs.values()) log.attached = false;
  }

  /** The control plane follows this run and has everything up to `after`: what it lacks, and live from here. */
  attach(runId: string, after: number) {
    const log = this.#logs.get(runId);
    if (!log) return [];
    log.attached = true;
    return log.entries.filter((entry) => entry.seq > after).map((entry) => entry.message);
  }

  ack(runId: string) {
    this.#logs.delete(runId);
  }

  ids() {
    return [...this.#logs.keys()];
  }
}
