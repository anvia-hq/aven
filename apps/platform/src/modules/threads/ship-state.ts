import type { ShipAct, ShipFacts, ShipLabel, ThreadPullRequest } from "./types";

const shipLabel = (latest: ThreadPullRequest | undefined): ShipLabel => {
  if (!latest) return "Ship";
  return latest.state === "open" ? "Update PR" : "New PR";
};

export function shipActionOf(facts: ShipFacts): ShipAct {
  const { gate, appKey, changes, branch, branchPulls, pullRequests, running, shipping, connected } =
    facts;
  const [latest] = pullRequests;
  const busy = running || shipping;
  if (gate.kind === "checking") return { kind: "loading" };
  if (!changes.loaded) return { kind: "loading" };
  if (changes.problem) return { kind: "failed", reason: changes.problem };
  if (changes.available === false) return { kind: "none" };
  if (gate.kind === "unknown") return { kind: "blocked", label: shipLabel(latest) };
  if (gate.kind === "missing") {
    const command = gate.commands[0];
    if (!command) return { kind: "none" };
    return { kind: "set-up", command, skill: command.replace(/^\//, ""), disabled: busy };
  }
  if (connected === null) return { kind: "loading" };
  if (!connected) return { kind: "connect", appKey };
  if (changes.any) {
    return {
      kind: "ship",
      label: shipLabel(latest),
      disabled: busy,
      shipping,
      canOpenNew: latest?.state === "open",
    };
  }
  if (latest) return { kind: "none" };
  if (!branch.loaded) return { kind: "loading" };
  if (branch.problem) return { kind: "failed", reason: branch.problem };
  if (!branch.any) return { kind: "none" };
  if (!branchPulls.loaded) return { kind: "loading" };
  if (branchPulls.problem !== null || !branchPulls.known || branchPulls.any)
    return { kind: "none" };
  return { kind: "open", disabled: busy };
}
