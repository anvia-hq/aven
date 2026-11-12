import type { ControlPlaneToRuntime, Reply, RunnerCallMethod } from "@aven/protocol/types";

type PendingCall = { resolve: (value: unknown) => void; reject: (error: Error) => void };

const CALL_TIMEOUT_MS = 10_000;

export class PendingCalls {
  #calls = new Map<string, PendingCall>();

  constructor(private post: (message: ControlPlaneToRuntime) => void) {}

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

  settle(reply: Reply) {
    const waiting = this.#calls.get(reply.id);

    if (!waiting) return;

    if (reply.ok) waiting.resolve(reply.result);
    else waiting.reject(new Error(reply.error ?? "The runtime reported an error"));
  }

  rejectAll(reason: string) {
    for (const waiting of this.#calls.values()) waiting.reject(new Error(reason));
  }
}
