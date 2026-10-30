import type { RepoAccess } from "@aven/protocol/runtime-wire";
import { threadBranch } from "@aven/protocol/thread-branch";

import { fetchBranch } from "./fetch-branch";
import { git, type Git } from "./git-clone";
import { gitFailure, hardenedGit } from "./host-git";

/**
 * Brings a workspace restored from a snapshot up to date for its own thread (decision 0043): the
 * default branch is fetched, and the thread's branch is made from it, replacing the branch the
 * snapshot's thread had. Files git does not track, such as `node_modules`, stay.
 */
export async function updateRestoredWorkspace(
  root: string,
  threadId: string,
  access: RepoAccess,
  run: Git = git,
) {
  await fetchBranch(root, access, access.defaultBranch, run);
  const checkout = await hardenedGit(run)(
    ["checkout", "-f", "-B", threadBranch(threadId), `origin/${access.defaultBranch}`],
    { cwd: root },
  );
  if (checkout.code !== 0)
    throw gitFailure("Could not update the workspace", checkout, access.token);
}
