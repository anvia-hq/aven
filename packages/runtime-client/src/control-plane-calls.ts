import type { CallMethod, ControlPlaneToRuntime, RuntimeCalls } from "@aven/protocol/types";
import type { ControlPlaneCallsContext } from "./types";

type Reply = Extract<ControlPlaneToRuntime, { type: "reply" }>;

type PendingCall = {
  method: CallMethod;
  params: unknown;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  once: boolean;
};

const ONCE: ReadonlySet<CallMethod> = new Set(["machine.call"]);

export function createControlPlaneCalls({ send, timeoutMs }: ControlPlaneCallsContext) {
  const pending = new Map<string, PendingCall>();

  const call = <M extends keyof RuntimeCalls>(
    method: M,
    params: RuntimeCalls[M]["params"],
    waitMs = timeoutMs,
  ) =>
    new Promise<RuntimeCalls[M]["result"]>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`The control plane did not answer ${method} within ${waitMs} ms`));
      }, waitMs);
      pending.set(id, {
        method,
        params,
        once: ONCE.has(method),
        resolve: (value) => (clearTimeout(timer), resolve(value as RuntimeCalls[M]["result"])),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      send({ type: "call", id, method, params });
    });

  const resend = () => {
    for (const [id, waiting] of pending) {
      if (waiting.once) {
        pending.delete(id);
        waiting.reject(
          new Error(`The connection dropped during ${waiting.method}, so it is not sent again`),
        );
        continue;
      }

      send({ type: "call", id, method: waiting.method, params: waiting.params });
    }
  };

  const settle = (reply: Reply) => {
    const waiting = pending.get(reply.id);

    if (!waiting) return;

    pending.delete(reply.id);

    if (reply.ok) waiting.resolve(reply.result);
    else waiting.reject(new Error(reply.error ?? "The control plane reported an error"));
  };

  return { call, resend, settle };
}
