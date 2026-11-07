import { threadBranch } from "@aven/protocol/thread-branch";

import { git, type Git } from "./git-clone";
import { gitFailure, hostGit } from "./host-git";
import { copyTree } from "./snapshots";
import { markFork } from "./thread-diff";

export async function forkWorkspace(from: string, to: string, forkId: string, run: Git = git) {
  await copyTree(from, to);
  const checkout = await hostGit(run)(["checkout", "-B", threadBranch(forkId)], { cwd: to });
  if (checkout.code !== 0) throw gitFailure("Could not start the fork's branch", checkout);
  if (!(await markFork(to, run))) throw new Error("Could not mark where the fork started");
}
