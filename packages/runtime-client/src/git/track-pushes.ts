import { safeGitConfig } from "./host-git";
import type { Git } from "../types";

const REFSPEC = "+refs/heads/aven/*:refs/remotes/origin/aven/*";
const MAX_TRACKED = 500;
const tracked = new Set<string>();

export async function trackPushes(root: string, run: Git) {
  if (tracked.has(root)) return;

  const known = await safeGitConfig(run, root, ["--get-all", "remote.origin.fetch"]);

  if (known.code === 0 && known.stdout.split("\n").includes(REFSPEC)) {
    if (tracked.size >= MAX_TRACKED) tracked.clear();

    tracked.add(root);
    return;
  }

  const added = await safeGitConfig(run, root, ["--add", "remote.origin.fetch", REFSPEC]);

  if (added.code === 0) {
    if (tracked.size >= MAX_TRACKED) tracked.clear();

    tracked.add(root);
  }
}
