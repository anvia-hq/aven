import { describe, expect, test } from "bun:test";

import { connectionOf, shipActionOf } from "./ship-state";
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

  test("does not wait for a branch read that is not made while the agent works", () => {
    const unread = { loaded: false, available: null, problem: null, any: false };
    expect(shipActionOf(facts({ running: true, branch: unread }))).toEqual({ kind: "none" });
    expect(shipActionOf(facts({ shipping: true, branch: unread }))).toEqual({ kind: "none" });
    expect(shipActionOf(facts({ branch: unread }))).toEqual({ kind: "loading" });
  });
});

describe("whether GitHub is connected", () => {
  const account = { data: { connected: false } };

  test("a runner's own login counts, with no account to ask about", () => {
    expect(connectionOf({ machine: true, appKey: null, checked: true, account: null })).toBe(true);
  });

  test("a project with no app and no login of the runner's is not connected, rather than loading for ever", () => {
    expect(connectionOf({ machine: false, appKey: null, checked: true, account: null })).toBe(
      false,
    );
    expect(connectionOf({ machine: false, appKey: null, checked: false, account: null })).toBe(
      null,
    );
  });

  test("a project with an app asks GitHub for the account", () => {
    expect(connectionOf({ machine: false, appKey: "app", checked: true, account: null })).toBe(
      null,
    );
    expect(connectionOf({ machine: false, appKey: "app", checked: true, account })).toBe(false);
    expect(
      connectionOf({
        machine: false,
        appKey: "app",
        checked: true,
        account: { data: { connected: true } },
      }),
    ).toBe(true);
  });
});

describe("the ship button says what it will do", () => {
  const unshipped = { changes: { loaded: true, available: true, problem: null, any: true } };

  test("opens a PR when the thread has none", () => {
    expect(shipActionOf(facts(unshipped))).toMatchObject({ label: "Open PR", primary: true });
  });

  test("updates the open PR by its number", () => {
    expect(shipActionOf(facts({ ...unshipped, pullRequests: [pull] }))).toMatchObject({
      label: "Update PR #658",
      primary: false,
      canOpenNew: true,
    });
  });

  test("opens a new PR once the last one is merged or closed", () => {
    for (const state of ["merged", "closed"] as const) {
      expect(
        shipActionOf(facts({ ...unshipped, pullRequests: [{ ...pull, state }] })),
      ).toMatchObject({ label: "Open new PR", primary: false, canOpenNew: false });
    }
  });
});
