import type { RepoAccess } from "@aven/protocol/runtime-wire";
import { threadBranch } from "@aven/protocol/thread-branch";

import { fetchBranch } from "./fetch-branch";
import { git, type Git } from "./git-clone";
import { gitFailure, hostGit } from "./host-git";
import { trackPushes } from "./track-pushes";

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
  const cleaned = await hostGit(run)(["clean", "-f", "-d"], { cwd: root });
  if (cleaned.code !== 0) throw gitFailure("Could not update the workspace", cleaned, access.token);
  await trackPushes(root, run);
}
