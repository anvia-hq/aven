import { hostGit, safeGitConfig } from "./host-git";
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

async function folderDefaultBranch(path: string, fallback: string, host: Git) {
  const head = await host(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], { cwd: path });

  if (head.code !== 0) return fallback;

  const trimmed = head.stdout.trim();
  const prefix = "refs/remotes/origin/";
  return trimmed.startsWith(prefix) && trimmed.length > prefix.length
    ? trimmed.slice(prefix.length)
    : fallback;
}

async function fetchUpstream(
  root: string,
  path: string,
  url: string,
  branch: string,
  head: string,
  run: Git,
  host: Git,
) {
  const targetBranch = await folderDefaultBranch(path, branch, host);
  const fetchRun = url.startsWith("ssh://") || url.startsWith("git@") ? run : host;
  const fetched = await fetchRun(
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
  host: Git,
) {
  const pending = upstreamInFlight.get(root);

  if (pending) return;

  const last = upstreamFetched.get(root);
  const fresh = last !== undefined && Date.now() - last.at < UPSTREAM_FRESH_MS;

  if (fresh && (!last.ok || last.head === head)) return;

  const path = folder.startsWith("file://") ? folder.slice("file://".length) : folder;
  const read = await safeGitConfig(run, path, ["--get", "remote.origin.url"]);
  const url = read.stdout.trim();

  if (read.code !== 0 || !UPSTREAM_URL.test(url)) {
    upstreamFetched.set(root, { at: Date.now(), head, ok: false });
    return;
  }

  const local = isFolder(url);
  const targetHost = local ? host : hostGit(run);
  const task = fetchUpstream(root, path, url, branch, head, run, targetHost)
    .catch(() => {
      upstreamFetched.set(root, { at: Date.now(), head, ok: false });
    })
    .finally(() => {
      upstreamInFlight.delete(root);
    });
  upstreamInFlight.set(root, task);

  if (local) await task;
}

export async function refreshBase(
  root: string,
  run: Git,
  known?: {
    host?: Git;
    base?: string | null;
    branch?: string | null;
    currentBranch?: string | null;
    head?: string;
  },
) {
  const url = await safeGitConfig(run, root, ["--get", "remote.origin.url"]);
  const folder = url.stdout.trim();

  if (url.code !== 0 || !isFolder(folder)) return;

  const host = known?.host ?? hostGit(run);
  const base = known?.base !== undefined ? known.base : await remoteBase(root, host);
  const branch =
    known?.branch !== undefined ? known.branch : await defaultBranchOf(root, base, host);

  if (!branch) return;

  const current =
    known?.currentBranch !== undefined
      ? known.currentBranch
      : await host(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root }).then((found) =>
          found.code === 0 ? found.stdout.trim() : null,
        );
  const family = current ? threadBranchFamily(current) : null;
  const refspecs = [`+refs/heads/${branch}:refs/remotes/origin/${branch}`];

  if (family) refspecs.push(`+refs/heads/${family}*:refs/remotes/origin/${family}*`);

  await host(["fetch", "--no-tags", "--", folder, ...refspecs], {
    cwd: root,
    timeoutMs: REFRESH_TIMEOUT_MS,
  });

  const head =
    known?.head !== undefined
      ? known.head
      : await host(["rev-parse", "--verify", "--quiet", "HEAD"], { cwd: root }).then((rev) =>
          rev.code === 0 ? rev.stdout.trim() : "",
        );
  await refreshUpstream(root, folder, branch, head, run, host);
}
