import type {
  CallMethod,
  ControlPlaneToRuntime,
  RuntimeCalls,
  RuntimeToControlPlane,
} from "@aven/protocol/runtime-wire";

type Reply = Extract<ControlPlaneToRuntime, { type: "reply" }>;

type PendingCall = {
  method: CallMethod;
  params: unknown;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export type ControlPlaneCallsContext = {
  /** False when the link is down and the message went nowhere. */
  send(message: RuntimeToControlPlane): boolean;
  timeoutMs: number;
};

// The runner's calls to the control plane: each waits for the reply that carries its id. A call
// sent over a connection that dropped is sent again on the next, until it is answered or times out.
export function createControlPlaneCalls({ send, timeoutMs }: ControlPlaneCallsContext) {
  const pending = new Map<string, PendingCall>();

  const call = <M extends keyof RuntimeCalls>(method: M, params: RuntimeCalls[M]["params"]) =>
    new Promise<RuntimeCalls[M]["result"]>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`The control plane did not answer ${method} within ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, {
        method,
        params,
        // The control plane's answer is taken to be what the method returns; it is not checked.
        resolve: (value) => (clearTimeout(timer), resolve(value as RuntimeCalls[M]["result"])),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      // Sent now if the link is up, and again whenever it comes back until it is answered.
      send({ type: "call", id, method, params });
    });

  /** Sends every call still waiting again, over a connection that has just opened. */
  const resend = () => {
    for (const [id, waiting] of pending)
      send({ type: "call", id, method: waiting.method, params: waiting.params });
  };

  /** Hands the control plane's answer to the call that asked. */
  const settle = (reply: Reply) => {
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if (reply.ok) waiting.resolve(reply.result);
    else waiting.reject(new Error(reply.error ?? "The control plane reported an error"));
  };

  return { call, resend, settle };
}
