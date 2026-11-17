import { useRequest } from "@/hooks/use-request";
import type { RunnerGithub, RuntimeGithubMode } from "@aven/protocol/types";
import type { ShipGate } from "../types";

type Readiness = {
  ready: boolean;
  ship: boolean;
  machine: boolean;
  githubMode: RuntimeGithubMode;
  runnerGithub: RunnerGithub | null;
};

type Shipping = {
  gate: ShipGate;
  machine: boolean;
  githubMode: RuntimeGithubMode;
  runnerGithub: RunnerGithub | null;
};

export function useShipReadiness(threadId: string, running: boolean): Shipping {
  const answer = useRequest<Readiness>(`/threads/${threadId}/ship`, {
    resetOn: threadId,
    refreshKey: running,
  });

  if (answer === null)
    return {
      gate: { kind: "checking" },
      machine: false,
      githubMode: "machine",
      runnerGithub: null,
    };

  if (answer.error !== null)
    return {
      gate: { kind: "unknown" },
      machine: false,
      githubMode: "machine",
      runnerGithub: null,
    };

  const { ready, ship, machine, githubMode, runnerGithub } = answer.data;

  if (ready) return { gate: { kind: "ready" }, machine, githubMode, runnerGithub };

  const commands: string[] = [];

  if (!ship) commands.push("/setup-ship");

  return { gate: { kind: "missing", commands }, machine, githubMode, runnerGithub };
}
