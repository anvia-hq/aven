import { describe, expect, test } from "bun:test";

import { shipActionOf } from "./ship-state";
import type { ShipFacts } from "./types";

const pull = { number: 658, url: "u", branch: "b", title: "t", state: "open" as const };

const facts = (over: Partial<ShipFacts> = {}): ShipFacts => ({
  running: false,
  shipping: false,
  gate: { kind: "ready" },
  appKey: "app",
  connected: true,
  changes: { loaded: true, available: true, problem: null, any: false },
  branch: { loaded: true, available: true, problem: null, any: true },
  branchPulls: { loaded: true, problem: null, known: true, any: false },
  pullRequests: [],
  ...over,
});

describe("Open a PR", () => {
  test("is offered when the branch has work, nothing is unshipped and GitHub has no pull request for it", () => {
    expect(shipActionOf(facts())).toEqual({ kind: "open", disabled: false });
  });

  test("is not offered when GitHub already has a pull request for the branch", () => {
    const branchPulls = { loaded: true, problem: null, known: true, any: true };
    expect(shipActionOf(facts({ branchPulls }))).toEqual({ kind: "none" });
  });

  test("waits for GitHub's answer, and is not offered when GitHub cannot say", () => {
    const waiting = { loaded: false, problem: null, known: false, any: false };
    expect(shipActionOf(facts({ branchPulls: waiting }))).toEqual({ kind: "loading" });
    const refused = { loaded: true, problem: "GitHub is down", known: false, any: false };
    expect(shipActionOf(facts({ branchPulls: refused }))).toEqual({ kind: "none" });
    const unnamed = { loaded: true, problem: null, known: false, any: false };
    expect(shipActionOf(facts({ branchPulls: unnamed }))).toEqual({ kind: "none" });
  });

  test("is not offered when the branch holds nothing beyond the default branch, or the thread has a pull request", () => {
    const branch = { loaded: true, available: true, problem: null, any: false };
    expect(shipActionOf(facts({ branch }))).toEqual({ kind: "none" });
    expect(shipActionOf(facts({ pullRequests: [pull] }))).toEqual({ kind: "none" });
  });

  test("is held back while the agent works", () => {
    expect(shipActionOf(facts({ running: true }))).toEqual({ kind: "open", disabled: true });
  });
});
