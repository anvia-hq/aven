import type { Git } from "./git-clone";

const REFSPEC = "+refs/heads/aven/*:refs/remotes/origin/aven/*";

export async function trackPushes(root: string, run: Git) {
  const known = await run(["config", "--get-all", "remote.origin.fetch"], { cwd: root });
  if (known.stdout.split("\n").includes(REFSPEC)) return;
  await run(["config", "--add", "remote.origin.fetch", REFSPEC], { cwd: root });
}
