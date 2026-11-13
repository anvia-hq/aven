import { join } from "node:path";

import { hostGit } from "./host-git";
import { remoteBase } from "./remote-base";
import { threadBranchFamily } from "./thread-branches";
import type { Git } from "./types";

const REFRESH_TIMEOUT_MS = 10_000;
const UPSTREAM_FRESH_MS = 60_000;
const UPSTREAM_URL = /^(https:\/\/|ssh:\/\/|git@|file:\/\/|\/)/;

export const UPSTREAM_REF = "refs/aven/upstream";

const upstreamFetchedAt = new Map<string, number>();

const isFolder = (url: string) => url.startsWith("/") || url.startsWith("file://");

async function refreshUpstream(root: string, folder: string, branch: string, run: Git) {
  const last = upstreamFetchedAt.get(root);

  if (last !== undefined && Date.now() - last < UPSTREAM_FRESH_MS) return;

  upstreamFetchedAt.set(root, Date.now());
  const path = folder.startsWith("file://") ? folder.slice("file://".length) : folder;
  const read = await run(
    ["config", "--file", join(path, ".git", "config"), "--get", "remote.origin.url"],
    {
      cwd: root,
    },
  );
  const url = read.stdout.trim();

  if (read.code !== 0 || !UPSTREAM_URL.test(url)) return;

  await run(["fetch", "--no-tags", "--", url, `+refs/heads/${branch}:${UPSTREAM_REF}`], {
    cwd: root,
    env: { GIT_TERMINAL_PROMPT: "0" },
    timeoutMs: REFRESH_TIMEOUT_MS,
  });
}

export async function refreshBase(root: string, run: Git) {
  const url = await run(["config", "--get", "remote.origin.url"], { cwd: root });
  const folder = url.stdout.trim();

  if (url.code !== 0 || !isFolder(folder)) return;

  const base = await remoteBase(root, run);

  if (!base) return;

  const named = await run(["rev-parse", "--abbrev-ref", base], { cwd: root });
  const branch = named.stdout.trim().replace(/^origin\//, "");

  if (named.code !== 0 || branch === "" || branch === "HEAD") return;

  const host = hostGit(run);
  const fetch = (refspec: string) =>
    host(["fetch", "--no-tags", "--", folder, refspec], {
      cwd: root,
      timeoutMs: REFRESH_TIMEOUT_MS,
    });

  await fetch(`+refs/heads/${branch}:refs/remotes/origin/${branch}`);
  await refreshUpstream(root, folder, branch, run);

  const current = await run(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root });
  const family = current.code === 0 ? threadBranchFamily(current.stdout.trim()) : null;

  if (family) await fetch(`+refs/heads/${family}*:refs/remotes/origin/${family}*`);
}
