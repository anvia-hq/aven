import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { DiffScope, ThreadDiff } from "@aven/protocol/runtime-wire";

import { git, type Git } from "./git-clone";

// Where the working tree stood when the thread's latest run began (decision 0030).
const TURN_REF = "refs/aven/turn";
// A patch past this is cut at a line, so one huge change cannot fill the wire or the page.
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const IDENTITY = {
  GIT_AUTHOR_NAME: "Aven",
  GIT_AUTHOR_EMAIL: "aven@localhost",
  GIT_COMMITTER_NAME: "Aven",
  GIT_COMMITTER_EMAIL: "aven@localhost",
};

// The tree of the working directory as it is now: tracked and untracked files, minus what git
// ignores. A scratch index leaves the thread's own staging area alone. Null when `root` is no
// repository.
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

/** Remembers the working tree as the start of a turn; false when `root` holds no repository. */
export async function markTurn(root: string, run: Git = git) {
  const tree = await workingTree(root, run);
  if (!tree) return false;
  const commit = await run(["commit-tree", tree, "-m", "Start of a turn"], {
    cwd: root,
    env: IDENTITY,
  });
  if (commit.code !== 0) return false;
  const saved = await run(["update-ref", TURN_REF, commit.stdout.trim()], { cwd: root });
  return saved.code === 0;
}

// Where the thread's branch left the default branch; HEAD when there is no remote branch to compare with.
async function branchPoint(root: string, run: Git) {
  const remote = await run(["rev-parse", "--verify", "--quiet", "origin/HEAD"], { cwd: root });
  if (remote.code !== 0) return "HEAD";
  const base = await run(["merge-base", "HEAD", "origin/HEAD"], { cwd: root });
  return base.code === 0 ? base.stdout.trim() : "HEAD";
}

async function turnStart(root: string, run: Git) {
  const start = await run(["rev-parse", "--verify", "--quiet", `${TURN_REF}^{tree}`], {
    cwd: root,
  });
  return start.code === 0 ? start.stdout.trim() : null;
}

function cut(patch: string): ThreadDiff {
  const bytes = new TextEncoder().encode(patch);
  if (bytes.length <= MAX_PATCH_BYTES) return { patch, truncated: false };
  const head = new TextDecoder().decode(bytes.subarray(0, MAX_PATCH_BYTES));
  return { patch: head.slice(0, head.lastIndexOf("\n") + 1), truncated: true };
}

/**
 * What a thread changed, as a unified patch: since its latest run began (`turn`) or since its
 * branch left the default branch (`all`). Null when the workspace is not a repository. A thread
 * whose turn was never marked has no start to compare with, so its turn is empty.
 */
export async function threadDiff(
  root: string,
  scope: DiffScope,
  run: Git = git,
): Promise<ThreadDiff | null> {
  const now = await workingTree(root, run);
  if (!now) return null;
  const from = scope === "turn" ? await turnStart(root, run) : await branchPoint(root, run);
  if (!from) return { patch: "", truncated: false };
  const diff = await run(
    [
      "-c",
      "core.quotepath=false",
      "diff",
      "--no-color",
      "--no-ext-diff",
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
