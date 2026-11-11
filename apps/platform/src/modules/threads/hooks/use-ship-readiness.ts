import { useRequest } from "@/hooks/use-request";
import type { ShipGate } from "../types";

type Readiness = { ready: boolean; ship: boolean; appKey: string };

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
  const { ready, ship, appKey } = answer.data;
  if (ready) return { gate: { kind: "ready" }, appKey };
  const commands: string[] = [];
  if (!ship) commands.push("/setup-ship");
  return { gate: { kind: "missing", commands }, appKey };
}
