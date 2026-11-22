import { layoutGraph } from "@aven/protocol/commit-graph";
import type { GitWipSummary } from "@aven/protocol/types";

import type {
  GitCenterSnapshot,
  GitCenterTarget,
  GitHygieneSummary,
  GraphDisplayRow,
} from "./types";

export function wipTotalFiles(wip: GitWipSummary) {
  return wip.staged + wip.unstaged + wip.untracked + wip.conflicted;
}

export function isWipDirty(wip: GitWipSummary) {
  return wipTotalFiles(wip) > 0;
}

export function buildGraphRows(snapshot: GitCenterSnapshot): {
  rows: GraphDisplayRow[];
  lanes: number;
} {
  const wipItems: {
    id: string;
    target: GitCenterTarget;
    label: string;
    branch: string | null;
    parentSha: string | null;
    wip: GitWipSummary;
    conflicts: GitCenterSnapshot["conflicts"];
    running: boolean;
  }[] = [];

  if (snapshot.mode === "live" && (isWipDirty(snapshot.wip) || snapshot.conflicts)) {
    wipItems.push({
      id: "wip:project",
      target: { kind: "project" },
      label: "Working Tree",
      branch: snapshot.headBranch,
      parentSha: snapshot.headSha,
      wip: snapshot.wip,
      conflicts: snapshot.conflicts,
      running: false,
    });
  }

  for (const thread of snapshot.threads) {
    if (isWipDirty(thread.wip) || thread.conflicts) {
      wipItems.push({
        id: `wip:thread:${thread.id}`,
        target: { kind: "thread", threadId: thread.id },
        label: thread.title,
        branch: thread.branch,
        parentSha: thread.headSha,
        wip: thread.wip,
        conflicts: thread.conflicts,
        running: thread.running,
      });
    }
  }

  const graphInput = [
    ...wipItems.map((item) => ({
      sha: item.id,
      parents: item.parentSha ? [item.parentSha] : [],
    })),
    ...snapshot.commits.map((commit) => ({
      sha: commit.sha,
      parents: commit.parents,
    })),
  ];

  const { rows: graphRows, lanes } = layoutGraph(graphInput);
  const threadsBySha = new Map<string, GitCenterSnapshot["threads"]>();
  const threadsByBranch = new Map<string, GitCenterSnapshot["threads"]>();

  for (const thread of snapshot.threads) {
    if (thread.headSha) {
      const list = threadsBySha.get(thread.headSha) ?? [];
      list.push(thread);
      threadsBySha.set(thread.headSha, list);
    } else if (thread.branch) {
      const list = threadsByBranch.get(thread.branch) ?? [];
      list.push(thread);
      threadsByBranch.set(thread.branch, list);
    }
  }

  const pullsBySha = new Map<string, GitCenterSnapshot["pulls"]>();
  const pullsByBranch = new Map<string, GitCenterSnapshot["pulls"]>();

  for (const pull of snapshot.pulls) {
    if (pull.headSha) {
      const list = pullsBySha.get(pull.headSha) ?? [];
      list.push(pull);
      pullsBySha.set(pull.headSha, list);
    }

    if (pull.head) {
      const list = pullsByBranch.get(pull.head) ?? [];
      list.push(pull);
      pullsByBranch.set(pull.head, list);
    }
  }

  const displayRows: GraphDisplayRow[] = [];

  for (let i = 0; i < wipItems.length; i++) {
    const item = wipItems[i]!;
    displayRows.push({
      kind: "wip",
      id: item.id,
      target: item.target,
      label: item.label,
      branch: item.branch,
      wip: item.wip,
      conflicts: item.conflicts,
      running: item.running,
      graph: graphRows[i]!,
    });
  }

  for (let i = 0; i < snapshot.commits.length; i++) {
    const commit = snapshot.commits[i]!;
    const graph = graphRows[wipItems.length + i]!;
    const seenThreads = new Set<string>();
    const attachedThreads: GitCenterSnapshot["threads"] = [];

    for (const t of threadsBySha.get(commit.sha) ?? []) {
      if (!seenThreads.has(t.id)) {
        seenThreads.add(t.id);
        attachedThreads.push(t);
      }
    }

    for (const ref of commit.refs) {
      for (const t of threadsByBranch.get(ref) ?? []) {
        if (!seenThreads.has(t.id)) {
          seenThreads.add(t.id);
          attachedThreads.push(t);
        }
      }
    }

    const seenPulls = new Set<number>();
    const attachedPulls: GitCenterSnapshot["pulls"] = [];

    for (const p of pullsBySha.get(commit.sha) ?? []) {
      if (!seenPulls.has(p.number)) {
        seenPulls.add(p.number);
        attachedPulls.push(p);
      }
    }

    for (const ref of commit.refs) {
      for (const p of pullsByBranch.get(ref) ?? []) {
        if (!seenPulls.has(p.number)) {
          seenPulls.add(p.number);
          attachedPulls.push(p);
        }
      }
    }

    displayRows.push({
      kind: "commit",
      id: commit.sha,
      commit,
      isHead: commit.sha === snapshot.headSha,
      threads: attachedThreads,
      pulls: attachedPulls,
      graph,
    });
  }

  return { rows: displayRows, lanes };
}

export function computeHygiene(snapshot: GitCenterSnapshot): GitHygieneSummary {
  const activeThreadBranches = new Set(
    snapshot.threads.flatMap((t) => (t.branch ? [t.branch] : [])),
  );
  const protectedNames = new Set(
    [snapshot.defaultBranch, snapshot.headBranch, "main", "master"].filter((name): name is string =>
      Boolean(name),
    ),
  );

  const mergedBranches = snapshot.branches.filter(
    (b) =>
      b.merged && !b.current && !protectedNames.has(b.name) && !activeThreadBranches.has(b.name),
  );
  const goneBranches = snapshot.branches.filter(
    (b) =>
      b.gone &&
      !b.merged &&
      !b.current &&
      !protectedNames.has(b.name) &&
      !activeThreadBranches.has(b.name),
  );
  const removableWorktrees = snapshot.worktrees.filter((w) => !w.isMain && !w.bare);

  return {
    mergedBranches,
    goneBranches,
    removableWorktrees,
    totalCount: mergedBranches.length + goneBranches.length + removableWorktrees.length,
  };
}
