import { hostGit } from "./host-git";
import { remoteBase } from "./remote-base";
import { threadBranchFamily } from "./thread-branches";
import type { Git } from "./types";

const REFRESH_TIMEOUT_MS = 10_000;

const isFolder = (url: string) => url.startsWith("/") || url.startsWith("file://");

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

  const current = await run(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root });
  const family = current.code === 0 ? threadBranchFamily(current.stdout.trim()) : null;

  if (family) await fetch(`+refs/heads/${family}*:refs/remotes/origin/${family}*`);
}
