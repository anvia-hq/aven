import type { ControlPlaneToRuntime, Reply, RunnerCallMethod } from "@aven/protocol/runtime-wire";

type PendingCall = { resolve: (value: unknown) => void; reject: (error: Error) => void };

const CALL_TIMEOUT_MS = 10_000;

// The calls the control plane has made of a runtime and not yet had answered.
export class PendingCalls {
  #calls = new Map<string, PendingCall>();

  constructor(private post: (message: ControlPlaneToRuntime) => void) {}

  // Asks the runtime about a thread (its desktop, changes or files). Rejects with the runtime's own
  // error, or when it does not answer in time.
  call(method: RunnerCallMethod, params: unknown, timeoutMs = CALL_TIMEOUT_MS) {
    return new Promise<unknown>((resolve, reject) => {
      const id = crypto.randomUUID();
      const finish = () => {
        clearTimeout(timer);
        this.#calls.delete(id);
      };
      const timer = setTimeout(() => {
        finish();
        reject(new Error(`The runtime did not answer ${method}`));
      }, timeoutMs);
      this.#calls.set(id, {
        resolve: (value) => (finish(), resolve(value)),
        reject: (error) => (finish(), reject(error)),
      });
      try {
        this.post({ type: "call", id, method, params });
      } catch (error) {
        this.#calls.get(id)?.reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // The runtime's answer to one of our calls; one we did not make, or gave up on, is ignored.
  settle(reply: Reply) {
    const waiting = this.#calls.get(reply.id);
    if (!waiting) return;
    if (reply.ok) waiting.resolve(reply.result);
    else waiting.reject(new Error(reply.error ?? "The runtime reported an error"));
  }

  rejectAll(reason: string) {
    // Settling a call takes it out of the map, which is safe to do while walking it.
    for (const waiting of this.#calls.values()) waiting.reject(new Error(reason));
  }
}
