import { mkdir, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { errorMessage } from "@aven/agents/values";

import { git, isCloned } from "./git-clone";
import { repositoryAddress } from "./repository-address";
import type { Git } from "./types";

const CLONE_TIMEOUT_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 60_000;

export async function cloneRepositoryFolder(reposDir: string, repository: string, run: Git = git) {
  const { url, host, owner, name } = repositoryAddress(repository);
  const target = join(reposDir, host, owner, name);

  if (await isCloned(target)) {
    await refreshRepositoryFolder(target, run);
    return { path: await realpath(target) };
  }

  await mkdir(dirname(target), { recursive: true });

  try {
    const cloned = await run(["clone", "--", url, target], {
      cwd: reposDir,
      timeoutMs: CLONE_TIMEOUT_MS,
    });

    if (cloned.code !== 0) throw new Error((cloned.stderr || cloned.stdout).trim());
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw new Error(
      `Could not clone ${url}: ${errorMessage(error)}. This computer must be signed in to git for a private repository`,
    );
  }

  return { path: await realpath(target) };
}

export async function refreshRepositoryFolder(folder: string, run: Git = git) {
  const fetched = await run(["fetch", "--prune", "origin"], {
    cwd: folder,
    timeoutMs: FETCH_TIMEOUT_MS,
  }).catch(() => undefined);

  if (!fetched || fetched.code !== 0) return false;

  const merged = await run(["merge", "--ff-only", "@{upstream}"], { cwd: folder }).catch(
    () => undefined,
  );
  return merged?.code === 0;
}
