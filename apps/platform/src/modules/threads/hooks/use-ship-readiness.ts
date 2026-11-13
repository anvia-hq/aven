import { useRequest } from "@/hooks/use-request";
import type { RunnerGithub, RuntimeGithubMode } from "@aven/protocol/types";
import type { ShipGate } from "../types";

type Readiness = {
  ready: boolean;
  ship: boolean;
  appKey: string | null;
  machine: boolean;
  githubMode: RuntimeGithubMode;
  runnerGithub: RunnerGithub | null;
};

type Shipping = {
  gate: ShipGate;
  appKey: string | null;
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
      appKey: null,
      machine: false,
      githubMode: "machine",
      runnerGithub: null,
    };

  if (answer.error !== null)
    return {
      gate: { kind: "unknown" },
      appKey: null,
      machine: false,
      githubMode: "machine",
      runnerGithub: null,
    };

  const { ready, ship, appKey, machine, githubMode, runnerGithub } = answer.data;

  if (ready) return { gate: { kind: "ready" }, appKey, machine, githubMode, runnerGithub };

  const commands: string[] = [];

  if (!ship) commands.push("/setup-ship");

  return { gate: { kind: "missing", commands }, appKey, machine, githubMode, runnerGithub };
}
