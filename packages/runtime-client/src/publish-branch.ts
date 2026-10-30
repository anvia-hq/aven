import type { RepoPushParams, RepoPushResult } from "@aven/protocol/runtime-wire";

import { authEnv, git, type Git } from "./git-clone";
import { remoteBase } from "./remote-base";

// The workspace's `.git` is written by the agent and these commands run on the runner's host with
// a token (decision 0040), so what git could run from it is switched off: hooks, the file system
// monitor and credential helpers; the system and global configuration are not read.
const SAFE_CONFIG = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "credential.helper=",
];
const SAFE_ENV = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };

const failure = (what: string, output: { stderr: string; stdout: string }, token = "") => {
  const text = (output.stderr || output.stdout).trim();
  return new Error(`${what}: ${token ? text.replaceAll(token, "***") : text}`);
};

/**
 * Commits what the thread changed in `root` and pushes its branch to `params.cloneUrl`, never
 * forced. `nothing` when the branch holds no change the remote's default branch lacks. The token
 * travels in git's environment, as for the clone, and is not in the error of a failed push.
 */
export async function publishBranch(
  root: string,
  params: RepoPushParams,
  run: Git = git,
): Promise<RepoPushResult> {
  const { branch, token, commitMessage, author } = params;
  const hardened: Git = (args, options) =>
    run([...SAFE_CONFIG, ...args], { ...options, env: { ...SAFE_ENV, ...options.env } });
  const safe = (args: string[], env?: Record<string, string>) => hardened(args, { cwd: root, env });
  const check = async (what: string, args: string[], env?: Record<string, string>) => {
    const done = await safe(args, env);
    if (done.code !== 0) throw failure(what, done, token);
    return done.stdout.trim();
  };

  // The agent may have switched branches; only the thread's own is published.
  const current = await safe(["symbolic-ref", "--short", "HEAD"]);
  if (current.code !== 0 || current.stdout.trim() !== branch) {
    throw new Error(`The workspace is not on the thread's branch ${branch}`);
  }

  await check("Could not stage the changes", ["add", "--all"]);
  const staged = await safe(["diff", "--cached", "--quiet"]);
  if (staged.code === 1) {
    await check("Could not commit the changes", ["commit", "--no-verify", "-m", commitMessage], {
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: author.name,
      GIT_COMMITTER_EMAIL: author.email,
    });
  } else if (staged.code !== 0) {
    throw failure("Could not look at the changes", staged, token);
  }

  // Without a remote default branch to compare with, push what there is.
  const base = await remoteBase(root, hardened);
  const ahead = base && (await safe(["rev-list", "--count", `${base}..HEAD`]));
  if (ahead && ahead.code === 0 && ahead.stdout.trim() === "0") return { kind: "nothing" };

  await check(
    "Could not push the branch",
    ["push", "--", params.cloneUrl, `HEAD:refs/heads/${branch}`],
    authEnv(params),
  );
  return {
    kind: "pushed",
    commit: await check("Could not read the commit", ["rev-parse", "HEAD"]),
  };
}
