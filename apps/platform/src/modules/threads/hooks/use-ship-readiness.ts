import { useRequest } from "@/hooks/use-request";

type Readiness = { ready: boolean; setup: boolean; ship: boolean; appKey: string };

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
//
// `appKey` is the GitHub App the thread's project is of, which the person's GitHub connection to
// ship has to be for (decision 0123); null until the answer is in.
export function useShipReadiness(
  threadId: string,
  running: boolean,
): { gate: ShipGate; appKey: string | null } {
  const answer = useRequest<Readiness>(`/threads/${threadId}/ship`, {
    resetOn: threadId,
    refreshKey: running,
  });
  if (answer === null) return { gate: { kind: "checking" }, appKey: null };
  if (answer.error !== null) return { gate: { kind: "unknown" }, appKey: null };
  const { ready, setup, ship, appKey } = answer.data;
  if (ready) return { gate: { kind: "ready" }, appKey };
  const commands: string[] = [];
  if (!setup) commands.push("/setup-env");
  if (!ship) commands.push("/setup-ship");
  return { gate: { kind: "missing", commands }, appKey };
}
