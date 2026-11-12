import { threadBranch } from "@aven/protocol/thread-branch";

import { git } from "./git-clone";
import { gitFailure, hostGit } from "./host-git";
import { copyTreeSharingObjects } from "./copy-tree";
import { markFork } from "./thread-diff";
import type { Git } from "./types";

export async function forkWorkspace(from: string, to: string, forkId: string, run: Git = git) {
  await copyTreeSharingObjects(from, to);
  const checkout = await hostGit(run)(["checkout", "-B", threadBranch(forkId)], { cwd: to });

  if (checkout.code !== 0) throw gitFailure("Could not start the fork's branch", checkout);

  if (!(await markFork(to, run))) throw new Error("Could not mark where the fork started");
}
