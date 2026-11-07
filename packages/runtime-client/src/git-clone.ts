import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { errorMessage } from "@aven/agents/values";
import type { RepoAccess } from "@aven/protocol/runtime-wire";
import { threadBranch } from "@aven/protocol/thread-branch";

import { runCommand, type CommandOutput } from "./run-command";
import { trackPushes } from "./track-pushes";

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

function headerKey(cloneUrl: string) {
  return URL.canParse(cloneUrl)
    ? `http.${new URL(cloneUrl).origin}/.extraHeader`
    : "http.extraHeader";
}

export function authEnv({ token, cloneUrl }: Pick<RepoAccess, "token" | "cloneUrl">) {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: headerKey(cloneUrl),
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

export async function isCloned(dir: string) {
  return (await readdir(dir).catch(() => [] as string[])).includes(".git");
}

export async function clearDirectory(dir: string) {
  await Promise.all(
    (await readdir(dir).catch(() => [] as string[])).map((entry) =>
      rm(join(dir, entry), { recursive: true, force: true }),
    ),
  );
}

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
    await trackPushes(dir, run);
  } catch (error) {
    await clearDirectory(dir);
    throw new Error(`Could not clone ${access.cloneUrl}: ${errorMessage(error)}`);
  }
}
