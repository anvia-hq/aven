import { describe, expect, test } from "bun:test";

import { buildGraphRows, computeHygiene } from "./graph-rows";
import type { GitCenterSnapshot } from "./types";

function baseSnapshot(): GitCenterSnapshot {
  return {
    project: {
      id: "p1",
      name: "aven",
      repoFullName: "anvia-hq/aven",
      directory: "/repo",
      runtimeId: "r1",
      defaultBranch: "main",
    },
    mode: "live",
    modeReason: "ok",
    githubConnected: true,
    headBranch: "main",
    headSha: "aaa1111",
    detached: false,
    defaultBranch: "main",
    branches: [
      {
        name: "main",
        sha: "aaa1111",
        current: true,
        upstream: "origin/main",
        ahead: 0,
        behind: 0,
        gone: false,
        merged: false,
        lastCommitDate: "2026-11-22T00:00:00Z",
      },
      {
        name: "old-merged",
        sha: "bbb2222",
        current: false,
        upstream: "origin/old-merged",
        ahead: 0,
        behind: 1,
        gone: true,
        merged: true,
        lastCommitDate: "2026-11-20T00:00:00Z",
      },
      {
        name: "squash-gone",
        sha: "ccc3333",
        current: false,
        upstream: "origin/squash-gone",
        ahead: 0,
        behind: 2,
        gone: true,
        merged: false,
        lastCommitDate: "2026-11-19T00:00:00Z",
      },
    ],
    remotes: [],
    tags: [],
    stashes: [],
    worktrees: [
      {
        path: "/repo",
        sha: "aaa1111",
        branch: "main",
        detached: false,
        bare: false,
        locked: false,
        prunable: false,
        isMain: true,
      },
      {
        path: "/repo-wt",
        sha: "bbb2222",
        branch: "old-merged",
        detached: false,
        bare: false,
        locked: false,
        prunable: true,
        isMain: false,
      },
    ],
    conflicts: null,
    wip: { staged: 1, unstaged: 0, untracked: 0, conflicted: 0, additions: 5, deletions: 2 },
    commits: [
      {
        sha: "aaa1111",
        shortSha: "aaa1111",
        message: "Latest commit",
        body: "",
        author: "Alice",
        authorEmail: "alice@example.com",
        date: "2026-11-22T00:00:00Z",
        parents: ["bbb2222"],
        refs: ["main"],
        remoteRefs: ["origin/main"],
        tags: [],
      },
      {
        sha: "bbb2222",
        shortSha: "bbb2222",
        message: "Earlier commit",
        body: "",
        author: "Bob",
        authorEmail: "bob@example.com",
        date: "2026-11-21T00:00:00Z",
        parents: [],
        refs: ["old-merged"],
        remoteRefs: [],
        tags: [],
      },
    ],
    hasMore: false,
    threads: [
      {
        id: "t1",
        title: "Add Git Center",
        branch: "feat/git-center",
        headSha: "aaa1111",
        running: true,
        canMutate: false,
        wip: { staged: 0, unstaged: 2, untracked: 0, conflicted: 0, additions: 10, deletions: 1 },
        conflicts: null,
        pullRequests: [],
        updatedAt: "2026-11-22T00:00:00Z",
      },
    ],
    pulls: [
      {
        number: 465,
        title: "Add Git Center",
        url: "https://github.com/anvia-hq/aven/pull/465",
        author: "alice",
        status: "open",
        head: "main",
        headSha: "aaa1111",
        base: "main",
        updatedAt: "2026-11-22T00:00:00Z",
      },
    ],
  };
}

describe("git-center graph-rows and hygiene", () => {
  test("prepends synthetic WIP nodes for dirty project and thread workspaces and overlays PRs/threads", () => {
    const snap = baseSnapshot();
    const { rows, lanes } = buildGraphRows(snap);
    expect(lanes).toBeGreaterThanOrEqual(2);
    expect(rows[0]!.kind).toBe("wip");
    expect(rows[1]!.kind).toBe("wip");
    expect(rows[2]!.kind).toBe("commit");

    if (rows[2]!.kind === "commit") {
      expect(rows[2]!.isHead).toBe(true);
      expect(rows[2]!.threads.map((t) => t.id)).toEqual(["t1"]);
      expect(rows[2]!.pulls.map((p) => p.number)).toEqual([465]);
    }
  });

  test("identifies merged branches, gone remotes, and removable worktrees without touching main", () => {
    const hygiene = computeHygiene(baseSnapshot());
    expect(hygiene.mergedBranches.map((b) => b.name)).toEqual(["old-merged"]);
    expect(hygiene.goneBranches.map((b) => b.name)).toEqual(["squash-gone"]);
    expect(hygiene.removableWorktrees.map((w) => w.path)).toEqual(["/repo-wt"]);
    expect(hygiene.totalCount).toBe(3);
  });
});
