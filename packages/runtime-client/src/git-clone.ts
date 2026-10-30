import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { errorMessage } from "@aven/agents/values";
import type { RepoAccess } from "@aven/protocol/runtime-wire";
import { threadBranch } from "@aven/protocol/thread-branch";

import { runCommand, type CommandOutput } from "./run-command";

export type Git = (
  args: string[],
  options: { cwd: string; env?: Record<string, string>; timeoutMs?: number },
) => Promise<CommandOutput>;

export const git: Git = (args, { cwd, env, timeoutMs }) =>
  runCommand(["git", ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    timeoutMs,
  });

// The header is limited to the clone URL's own origin, so a redirect elsewhere never sees the token.
// A path (a local test remote) has no origin and gets the unscoped key.
function headerKey(cloneUrl: string) {
  return URL.canParse(cloneUrl)
    ? `http.${new URL(cloneUrl).origin}/.extraHeader`
    : "http.extraHeader";
}

// The token travels in git's environment configuration, so it is neither in the process's
// arguments nor written to .git/config (decision 0013).
export function authEnv({ token, cloneUrl }: Pick<RepoAccess, "token" | "cloneUrl">) {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: headerKey(cloneUrl),
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

/** Whether `dir` already holds a clone. */
export async function isCloned(dir: string) {
  return (await readdir(dir).catch(() => [] as string[])).includes(".git");
}

/** Empties `dir`, dotfiles included, so a failed attempt leaves nothing for the next run to trip on. */
export async function clearDirectory(dir: string) {
  await Promise.all(
    (await readdir(dir).catch(() => [] as string[])).map((entry) =>
      rm(join(dir, entry), { recursive: true, force: true }),
    ),
  );
}

// Clones the repository's default branch into the empty `dir` and moves onto the thread's own
// branch. A failed clone leaves `dir` empty again, so the next run tries afresh.
export async function cloneRepository(
  dir: string,
  threadId: string,
  access: RepoAccess,
  run: Git = git,
) {
  const env = authEnv(access);
  const redact = (text: string) => text.replaceAll(access.token, "***").trim();
  try {
    const cloned = await run(
      ["clone", "--single-branch", "--branch", access.defaultBranch, "--", access.cloneUrl, "."],
      { cwd: dir, env },
    );
    if (cloned.code !== 0) throw new Error(redact(cloned.stderr || cloned.stdout));
    const branched = await run(["checkout", "-b", threadBranch(threadId)], { cwd: dir });
    if (branched.code !== 0) throw new Error(redact(branched.stderr || branched.stdout));
  } catch (error) {
    await clearDirectory(dir);
    throw new Error(`Could not clone ${access.cloneUrl}: ${errorMessage(error)}`);
  }
}
