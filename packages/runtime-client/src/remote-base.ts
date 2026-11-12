import { git } from "./git-clone";
import type { Git } from "./types";

export async function remoteBase(root: string, run: Git = git) {
  const head = await run(["rev-parse", "--verify", "--quiet", "origin/HEAD"], { cwd: root });

  if (head.code === 0) return "origin/HEAD";

  const listed = await run(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"], {
    cwd: root,
  });
  const current = await run(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root });
  const own = current.code === 0 ? `origin/${current.stdout.trim()}` : null;
  const branches = listed.stdout
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name !== "" && name !== "origin" && name !== own);
  return listed.code === 0 && branches.length === 1 ? branches[0]! : null;
}
