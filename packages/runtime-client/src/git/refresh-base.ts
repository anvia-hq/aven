import { join } from "node:path";

import { hostGit } from "./host-git";
import { defaultBranchOf, remoteBase } from "./remote-base";
import { threadBranchFamily } from "./thread-branches";
import type { Git } from "../types";

const REFRESH_TIMEOUT_MS = 10_000;
const UPSTREAM_FRESH_MS = 60_000;
const UPSTREAM_URL = /^(https:\/\/|ssh:\/\/|git@|file:\/\/|\/)/;

export const UPSTREAM_REF = "refs/aven/upstream";

const upstreamFetched = new Map<string, { at: number; head: string; ok: boolean }>();
const upstreamInFlight = new Map<string, Promise<void>>();

const isFolder = (url: string) => url.startsWith("/") || url.startsWith("file://");

async function folderDefaultBranch(path: string, fallback: string, run: Git) {
  const head = await run(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], { cwd: path });

  if (head.code !== 0) return fallback;

  const trimmed = head.stdout.trim();
  const prefix = "refs/remotes/origin/";
  return trimmed.startsWith(prefix) && trimmed.length > prefix.length
    ? trimmed.slice(prefix.length)
    : fallback;
}

async function fetchUpstream(root: string, folder: string, branch: string, head: string, run: Git) {
  const path = folder.startsWith("file://") ? folder.slice("file://".length) : folder;
  const read = await run(
    ["config", "--file", join(path, ".git", "config"), "--get", "remote.origin.url"],
    {
      cwd: root,
    },
  );
  const url = read.stdout.trim();

  if (read.code !== 0 || !UPSTREAM_URL.test(url)) {
    upstreamFetched.set(root, { at: Date.now(), head, ok: false });
    return;
  }

  const targetBranch = await folderDefaultBranch(path, branch, run);
  const fetched = await run(
    ["fetch", "--no-tags", "--", url, `+refs/heads/${targetBranch}:${UPSTREAM_REF}`],
    {
      cwd: root,
      env: { GIT_TERMINAL_PROMPT: "0" },
      timeoutMs: REFRESH_TIMEOUT_MS,
    },
  );
  upstreamFetched.set(root, { at: Date.now(), head, ok: fetched.code === 0 });
}

async function refreshUpstream(
  root: string,
  folder: string,
  branch: string,
  head: string,
  run: Git,
) {
  const pending = upstreamInFlight.get(root);

  if (pending) return pending;

  const last = upstreamFetched.get(root);
  const fresh = last !== undefined && Date.now() - last.at < UPSTREAM_FRESH_MS;

  if (fresh && (!last.ok || last.head === head)) return;

  const task = fetchUpstream(root, folder, branch, head, run).finally(() => {
    upstreamInFlight.delete(root);
  });
  upstreamInFlight.set(root, task);
  return task;
}

export async function refreshBase(root: string, run: Git) {
  const url = await run(["config", "--get", "remote.origin.url"], { cwd: root });
  const folder = url.stdout.trim();

  if (url.code !== 0 || !isFolder(folder)) return;

  const host = hostGit(run);
  const base = await remoteBase(root, host);
  const branch = await defaultBranchOf(root, base, host);

  if (!branch) return;

  const fetch = (refspec: string) =>
    host(["fetch", "--no-tags", "--", folder, refspec], {
      cwd: root,
      timeoutMs: REFRESH_TIMEOUT_MS,
    });

  await fetch(`+refs/heads/${branch}:refs/remotes/origin/${branch}`);

  const rev = await host(["rev-parse", "--verify", "--quiet", "HEAD"], { cwd: root });
  const head = rev.code === 0 ? rev.stdout.trim() : "";
  await refreshUpstream(root, folder, branch, head, run);

  const current = await host(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root });
  const family = current.code === 0 ? threadBranchFamily(current.stdout.trim()) : null;

  if (family) await fetch(`+refs/heads/${family}*:refs/remotes/origin/${family}*`);
}
