import type { RepoAccess } from "@aven/protocol/runtime-wire";
import { threadBranch } from "@aven/protocol/thread-branch";

import { fetchBranch } from "./fetch-branch";
import { git, type Git } from "./git-clone";
import { gitFailure, hostGit } from "./host-git";
import { trackPushes } from "./track-pushes";

/**
 * Brings a workspace restored from a snapshot up to date for its own thread (decision 0043): the
 * default branch is fetched, and the thread's branch is made from it, replacing the branch the
 * snapshot's thread had. Files git ignores, such as `node_modules`, stay; untracked files it does
 * not ignore are removed, so the new thread starts with no changes.
 */
export async function updateRestoredWorkspace(
  root: string,
  threadId: string,
  access: RepoAccess,
  run: Git = git,
) {
  await fetchBranch(root, access, access.defaultBranch, run);
  const checkout = await hostGit(run)(
    ["checkout", "-f", "-B", threadBranch(threadId), `origin/${access.defaultBranch}`],
    { cwd: root },
  );
  if (checkout.code !== 0)
    throw gitFailure("Could not update the workspace", checkout, access.token);
  // What the snapshot's thread left untracked and not ignored (the `.aven/` files it wrote, not yet
  // merged) is not this thread's and would show as its changes. Ignored files stay, with the
  // dependencies and caches setup made; without `-x`, `.gitignore` and `.git/info/exclude` hold.
  const cleaned = await hostGit(run)(["clean", "-f", "-d"], { cwd: root });
  if (cleaned.code !== 0) throw gitFailure("Could not update the workspace", cleaned, access.token);
  await trackPushes(root, run);
}
