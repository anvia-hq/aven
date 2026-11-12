import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { git } from "./git-clone";
import { hostGit } from "./host-git";
import { refreshBase } from "./refresh-base";
import { remoteBase } from "./remote-base";
import { threadBranchFamily } from "./thread-branches";
import { trackPushes } from "./track-pushes";
import type { DiffScope, ThreadDiff } from "@aven/protocol/types";
import type { Git } from "./types";

const TURN_REF = "refs/aven/turn";
const FORK_REF = "refs/aven/fork-base";
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const IDENTITY = {
  GIT_AUTHOR_NAME: "Aven",
  GIT_AUTHOR_EMAIL: "aven@localhost",
  GIT_COMMITTER_NAME: "Aven",
  GIT_COMMITTER_EMAIL: "aven@localhost",
};

async function workingTree(root: string, run: Git) {
  const index = join(root, ".git", `aven-index-${randomUUID()}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    const added = await run(["add", "--all"], { cwd: root, env });

    if (added.code !== 0) return null;

    const written = await run(["write-tree"], { cwd: root, env });
    return written.code === 0 ? written.stdout.trim() : null;
  } finally {
    await rm(index, { force: true });
  }
}

async function markTree(root: string, ref: string, message: string, run: Git) {
  const host = hostGit(run);
  const tree = await workingTree(root, host);

  if (!tree) return false;

  const commit = await host(["commit-tree", tree, "-m", message], { cwd: root, env: IDENTITY });

  if (commit.code !== 0) return false;

  const saved = await host(["update-ref", ref, commit.stdout.trim()], { cwd: root });
  return saved.code === 0;
}

export const markTurn = (root: string, run: Git = git) =>
  markTree(root, TURN_REF, "Start of a turn", run);

export const markFork = (root: string, run: Git = git) =>
  markTree(root, FORK_REF, "Start of a fork", run);

async function branchPoint(root: string, run: Git) {
  const remote = await remoteBase(root, run);

  if (!remote) return "HEAD";

  const base = await run(["merge-base", "HEAD", remote], { cwd: root });
  return base.code === 0 ? base.stdout.trim() : "HEAD";
}

async function turnStart(root: string, run: Git) {
  const start = await run(["rev-parse", "--verify", "--quiet", `${TURN_REF}^{tree}`], {
    cwd: root,
  });
  return start.code === 0 ? start.stdout.trim() : null;
}

const PUSHED_COPIES = 5;

async function pushedTrees(root: string, run: Git, configure: Git) {
  await trackPushes(root, configure);
  const branch = await run(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root });

  if (branch.code !== 0) return [];

  const name = branch.stdout.trim();
  const family = threadBranchFamily(name);
  const patterns = family
    ? [`refs/remotes/origin/${family}`, `refs/remotes/origin/${family}-*`]
    : [`refs/remotes/origin/${name}`];
  const listed = await run(
    [
      "for-each-ref",
      "--sort=-committerdate",
      `--count=${PUSHED_COPIES}`,
      "--format=%(objectname)",
      ...patterns,
    ],
    { cwd: root },
  );
  const commits = listed.stdout.split("\n").filter(Boolean);
  const trees = await Promise.all(
    commits.map((commit) => run(["rev-parse", `${commit}^{tree}`], { cwd: root })),
  );
  return [...new Set(trees.filter((tree) => tree.code === 0).map((tree) => tree.stdout.trim()))];
}

function cut(patch: string): ThreadDiff {
  const bytes = new TextEncoder().encode(patch);

  if (bytes.length <= MAX_PATCH_BYTES) return { patch, truncated: false };

  const head = new TextDecoder().decode(bytes.subarray(0, MAX_PATCH_BYTES));
  return { patch: head.slice(0, head.lastIndexOf("\n") + 1), truncated: true };
}

export async function threadDiff(
  root: string,
  scope: DiffScope,
  run: Git = git,
): Promise<ThreadDiff | null> {
  const host = hostGit(run);
  const now = await workingTree(root, host);

  if (!now) return null;

  if (scope === "turn") {
    const start = await turnStart(root, host);
    return start ? patchBetween(root, start, now, host) : { patch: "", truncated: false };
  }

  await refreshBase(root, run);

  const point = await patchBetween(root, await branchPoint(root, host), now, host);

  if (scope === "all") return point;

  const copies = await pushedTrees(root, host, run);
  const ahead = await Promise.all(copies.map((tree) => patchBetween(root, tree, now, host)));
  return [...ahead, point].reduce((nearest, next) =>
    next.patch.length < nearest.patch.length ? next : nearest,
  );
}

export async function currentBranch(root: string, run: Git = git) {
  const found = await hostGit(run)(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root });
  return found.code === 0 ? found.stdout.trim() : null;
}

export async function forkChanges(root: string, run: Git = git): Promise<ThreadDiff | null> {
  const host = hostGit(run);
  const now = await workingTree(root, host);

  if (!now) return null;

  const start = await host(["rev-parse", "--verify", "--quiet", `${FORK_REF}^{tree}`], {
    cwd: root,
  });

  if (start.code !== 0) return null;

  return patchBetween(root, start.stdout.trim(), now, host);
}

async function patchBetween(root: string, from: string, now: string, host: Git) {
  const diff = await host(
    [
      "-c",
      "core.quotepath=false",
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--find-renames",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      from,
      now,
    ],
    { cwd: root },
  );

  if (diff.code !== 0) throw new Error("Could not compare the thread's changes");

  return cut(diff.stdout);
}
