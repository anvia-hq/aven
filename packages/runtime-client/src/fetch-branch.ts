import { authEnv, git } from "./git-clone";
import { gitFailure, hostGit } from "./host-git";
import type { RepoAccess } from "@aven/protocol/types";
import type { Fetched, Git } from "./types";

const FETCH_TIMEOUT_MS = 2 * 60_000;

const BRANCH_NAME = /^(?![-/])[\w./-]+$/;
export function isBranchName(name: string) {
  return (
    BRANCH_NAME.test(name) &&
    !name.includes("..") &&
    !name.includes("//") &&
    !/[/.]$/.test(name) &&
    !name.endsWith(".lock") &&
    name !== "HEAD"
  );
}

export async function fetchBranch(
  root: string,
  access: RepoAccess,
  branch: string = access.defaultBranch,
  run: Git = git,
): Promise<Fetched> {
  if (!isBranchName(branch)) throw new Error(`"${branch}" is not a branch name`);

  const hardened = hostGit(run);
  const ref = `refs/remotes/origin/${branch}`;
  const read = async () => {
    const found = await hardened(["rev-parse", "--verify", "--quiet", ref], { cwd: root });
    return found.code === 0 ? found.stdout.trim() : null;
  };

  const previous = await read();
  const fetched = await hardened(
    ["fetch", "--no-tags", "--", access.cloneUrl, `+refs/heads/${branch}:${ref}`],
    { cwd: root, env: authEnv(access), timeoutMs: FETCH_TIMEOUT_MS },
  );

  if (fetched.code !== 0) throw gitFailure(`Could not fetch ${branch}`, fetched, access.token);

  const commit = await read();

  if (!commit) throw new Error(`Could not fetch ${branch}: git left no ${ref}`);

  return { branch, commit, previous };
}
