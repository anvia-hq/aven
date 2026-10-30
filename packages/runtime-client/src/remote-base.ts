import { git, type Git } from "./git-clone";

/**
 * The remote's default branch as a workspace knows it, to see where a thread's branch left it:
 * `origin/HEAD` when there is one. A clone made with `--branch` has none (git sets it only when it
 * picks the branch itself), but it holds that one remote branch alone, so the only one is it.
 * Null when there is no way to tell.
 */
export async function remoteBase(root: string, run: Git = git) {
  const head = await run(["rev-parse", "--verify", "--quiet", "origin/HEAD"], { cwd: root });
  if (head.code === 0) return "origin/HEAD";
  const listed = await run(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"], {
    cwd: root,
  });
  const branches = listed.stdout
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name !== "" && name !== "origin");
  return listed.code === 0 && branches.length === 1 ? branches[0]! : null;
}
