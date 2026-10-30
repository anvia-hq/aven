import { git, type Git } from "./git-clone";

// The workspace's `.git` is written by the agent and these commands run on the runner's host with
// a token (decisions 0040 and 0042), so what git could run from it is switched off: hooks, the file
// system monitor, credential helpers and background maintenance; the system and global
// configuration are not read.
const SAFE_CONFIG = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "credential.helper=",
  "-c",
  "gc.auto=0",
  "-c",
  "maintenance.auto=false",
];
const SAFE_ENV = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };

/** `run`, with what the agent could have planted in the workspace's git configuration switched off. */
export function hardenedGit(run: Git = git): Git {
  return (args, options) =>
    run([...SAFE_CONFIG, ...args], { ...options, env: { ...SAFE_ENV, ...options.env } });
}

/** An error for a failed git command, in git's own words with the token left out. */
export function gitFailure(what: string, output: { stderr: string; stdout: string }, token = "") {
  const text = (output.stderr || output.stdout).trim();
  return new Error(`${what}: ${token ? text.replaceAll(token, "***") : text}`);
}
