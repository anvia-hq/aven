import type { RepoAccess } from "@aven/protocol/runtime-wire";

import { authEnv, git, type Git } from "./git-clone";
import { gitFailure, hardenedGit } from "./host-git";

// A plain branch name, as a person types one: no leading `-` or `/`, no `..`, no `//`, no trailing
// `/`, `.` or `.lock`, and not `HEAD`. Anything else is not fetched (decision 0042).
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

/** What a fetch did: the branch, where `origin/<branch>` is now, and where it was (null if it was not there). */
export type Fetched = { branch: string; commit: string; previous: string | null };

/**
 * Brings `branch` (the default branch when none is named) of the thread's repository into the
 * workspace as `origin/<branch>` and changes nothing else (decision 0042). It runs on the runner's
 * host with the read-only token of `access`, from the clone URL of `access` rather than the
 * workspace's own `origin`, which the agent can rewrite; the token travels in git's environment
 * and is left out of errors.
 */
export async function fetchBranch(
  root: string,
  access: RepoAccess,
  branch: string = access.defaultBranch,
  run: Git = git,
): Promise<Fetched> {
  if (!isBranchName(branch)) throw new Error(`"${branch}" is not a branch name`);
  const hardened = hardenedGit(run);
  const ref = `refs/remotes/origin/${branch}`;
  const read = async () => {
    const found = await hardened(["rev-parse", "--verify", "--quiet", ref], { cwd: root });
    return found.code === 0 ? found.stdout.trim() : null;
  };

  const previous = await read();
  const fetched = await hardened(
    ["fetch", "--no-tags", "--", access.cloneUrl, `+refs/heads/${branch}:${ref}`],
    { cwd: root, env: authEnv(access) },
  );
  if (fetched.code !== 0) throw gitFailure(`Could not fetch ${branch}`, fetched, access.token);
  const commit = await read();
  if (!commit) throw new Error(`Could not fetch ${branch}: git left no ${ref}`);
  return { branch, commit, previous };
}
