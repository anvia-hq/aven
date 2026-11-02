import { useRequest } from "@/hooks/use-request";

type Readiness = { ready: boolean; setup: boolean; ship: boolean };

/** Whether the thread can be shipped now, and if not, why not. */
export type ShipGate =
  | { kind: "checking" }
  | { kind: "ready" }
  /** The runner could not say, as when it is offline. */
  | { kind: "unknown" }
  /** What the repository still needs: the slash commands that make it. */
  | { kind: "missing"; commands: string[] };

// Whether the thread's repository is set up to ship (decision 0083): `/setup-env` has written its
// environment and `/setup-ship` how it ships. Asked again when a run starts or ends, which is when
// the agent writes them.
export function useShipReadiness(threadId: string, running: boolean): ShipGate {
  const answer = useRequest<Readiness>(`/threads/${threadId}/ship`, {
    resetOn: threadId,
    refreshKey: running,
  });
  if (answer === null) return { kind: "checking" };
  if (answer.error !== null) return { kind: "unknown" };
  const { ready, setup, ship } = answer.data;
  if (ready) return { kind: "ready" };
  const commands: string[] = [];
  if (!setup) commands.push("/setup-env");
  if (!ship) commands.push("/setup-ship");
  return { kind: "missing", commands };
}
