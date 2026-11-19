import type {
  ShipAct,
  ShipConnectionFacts,
  ShipFacts,
  ShipLabel,
  ThreadPullRequest,
} from "./types";

const shipLabel = (latest: ThreadPullRequest | undefined): ShipLabel => {
  if (!latest) return "Open PR";

  return latest.state === "open" ? `Update PR #${latest.number}` : "Open new PR";
};

export function shipActionOf(facts: ShipFacts): ShipAct {
  const { gate, changes, branch, branchPulls, pullRequests, running, shipping, connected } = facts;
  const [latest] = pullRequests;
  const busy = running || shipping;

  if (gate.kind === "checking") return { kind: "loading" };

  if (!changes.loaded) return { kind: "loading" };

  if (changes.problem) return { kind: "failed", reason: changes.problem };

  if (changes.available === false) return { kind: "none" };

  if (gate.kind === "unknown") return { kind: "blocked", label: shipLabel(latest) };

  const { custom } = gate;

  if (connected === null) return { kind: "loading" };

  if (!connected) return { kind: "connect" };

  if (changes.any) {
    return {
      kind: "ship",
      label: shipLabel(latest),
      primary: !latest,
      disabled: busy,
      shipping,
      canOpenNew: latest?.state === "open",
      custom,
    };
  }

  if (latest) return { kind: "none" };

  if (!branch.loaded) return busy ? { kind: "none" } : { kind: "loading" };

  if (branch.problem) return { kind: "failed", reason: branch.problem };

  if (!branch.any) return { kind: "none" };

  if (!branchPulls.loaded) return { kind: "loading" };

  if (branchPulls.problem !== null || !branchPulls.known || branchPulls.any)
    return { kind: "none" };

  return { kind: "open", disabled: busy, custom };
}

export function connectionOf({ machine, account }: ShipConnectionFacts): boolean | null {
  if (machine) return true;

  if (account === null) return null;

  return account.data?.connected !== false;
}
