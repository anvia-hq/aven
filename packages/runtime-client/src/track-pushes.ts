import type { Git } from "./git-clone";

// The clone fetches one branch only, so git has no `origin/<branch>` for what the thread pushes, and
// with it no way to tell what the pull request already holds. This keeps those in step.
const REFSPEC = "+refs/heads/aven/*:refs/remotes/origin/aven/*";

/** Has pushes of the thread's own branches (`aven/*`) recorded as `origin/aven/*`. Safe to repeat. */
export async function trackPushes(root: string, run: Git) {
  const known = await run(["config", "--get-all", "remote.origin.fetch"], { cwd: root });
  if (known.stdout.split("\n").includes(REFSPEC)) return;
  await run(["config", "--add", "remote.origin.fetch", REFSPEC], { cwd: root });
}
