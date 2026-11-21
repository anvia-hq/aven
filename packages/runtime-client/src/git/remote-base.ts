import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";

import { git } from "./git-clone";
import type { Git } from "../types";

const MAINLINE_BRANCHES = new Set(["main", "master"]);
const FETCH_HEAD_MAX_BYTES = 64 * 1024;
const FETCH_HEAD_LINE = /^([0-9a-f]{40}(?:[0-9a-f]{24})?)\t[^\t]*\tbranch '([^']+)' of /;

export async function remoteBase(root: string, run: Git = git) {
  const head = await run(["rev-parse", "--verify", "--quiet", "origin/HEAD"], { cwd: root });

  if (head.code === 0) return "origin/HEAD";

  const listed = await run(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"], {
    cwd: root,
  });

  if (listed.code !== 0) return null;

  const current = await run(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root });
  const own = current.code === 0 ? `origin/${current.stdout.trim()}` : null;
  const branches = listed.stdout.split("\n").flatMap((line) => {
    const name = line.trim();
    return name !== "" && name !== "origin" && name !== own && !name.startsWith("origin/aven/")
      ? [name]
      : [];
  });

  if (branches.length === 1) return branches[0]!;

  return branches.find((name) => MAINLINE_BRANCHES.has(name.slice("origin/".length))) ?? null;
}

export async function defaultBranchOf(root: string, base: string | null, run: Git = git) {
  if (!base) return null;

  const named = await run(["rev-parse", "--abbrev-ref", base], { cwd: root });

  if (named.code !== 0) return null;

  const branch = named.stdout.trim().replace(/^origin\//, "");
  return branch !== "" && branch !== "HEAD" ? branch : null;
}

export async function remoteMainlineRefs(
  root: string,
  defaultBranch: string | null,
  run: Git = git,
) {
  const listed = await run(["for-each-ref", "--format=%(refname)", "refs/remotes"], { cwd: root });

  if (listed.code !== 0) return [];

  return listed.stdout.split("\n").flatMap((line) => {
    const ref = line.trim();

    if (!ref.startsWith("refs/remotes/")) return [];

    const rest = ref.slice("refs/remotes/".length);
    const slash = rest.indexOf("/");

    if (slash === -1) return [];

    const leaf = rest.slice(slash + 1);
    const isMainline =
      leaf === "HEAD" ||
      MAINLINE_BRANCHES.has(leaf) ||
      (defaultBranch !== null && leaf === defaultBranch);
    return isMainline ? [ref] : [];
  });
}

async function readFetchHead(root: string) {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const file = await open(join(root, ".git", "FETCH_HEAD"), flags).catch(() => null);

  if (!file) return null;

  try {
    const info = await file.stat();

    if (!info.isFile() || info.size > FETCH_HEAD_MAX_BYTES) return null;

    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}

export async function fetchedMainlineCommits(root: string, defaultBranch: string | null) {
  const text = await readFetchHead(root);

  if (!text) return [];

  const commits = text.split("\n").flatMap((line) => {
    const match = FETCH_HEAD_LINE.exec(line);

    if (!match) return [];

    const [, sha, branch] = match;
    const isMainline =
      MAINLINE_BRANCHES.has(branch!) || (defaultBranch !== null && branch === defaultBranch);
    return isMainline ? [sha!] : [];
  });
  return [...new Set(commits)];
}
