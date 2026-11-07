import { threadBranch } from "@aven/protocol/thread-branch";

import { git, type Git } from "./git-clone";
import { gitFailure, hostGit } from "./host-git";
import { copyTree } from "./snapshots";
import { markFork } from "./thread-diff";

/**
 * Makes `to`, an empty directory, a copy of a thread's workspace for a thread forked from it
 * (decision 0135): the working tree as it is, uncommitted changes and ignored files such as
 * `node_modules` included, on a branch of the fork's own. The tree it started from is remembered so
 * the fork's changes can be told apart from the parent's.
 */
export async function forkWorkspace(from: string, to: string, forkId: string, run: Git = git) {
  await copyTree(from, to);
  // `-B` with no start point keeps HEAD and the working tree, and only moves the branch name.
  const checkout = await hostGit(run)(["checkout", "-B", threadBranch(forkId)], { cwd: to });
  if (checkout.code !== 0) throw gitFailure("Could not start the fork's branch", checkout);
  if (!(await markFork(to, run))) throw new Error("Could not mark where the fork started");
}
