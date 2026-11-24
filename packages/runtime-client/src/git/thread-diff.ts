import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { git } from "./git-clone";
import { hostGit, withHostGit } from "./host-git";
import { refreshBase, UPSTREAM_REF } from "./refresh-base";
import {
  defaultBranchOf,
  fetchedMainlineCommits,
  remoteBase,
  remoteMainlineRefs,
} from "./remote-base";
import { threadBranchFamily } from "./thread-branches";
import { trackPushes } from "./track-pushes";
import type { DiffScope, DiffSummary, ThreadDiff } from "@aven/protocol/types";
import type { Git } from "../types";

const TURN_REF = "refs/aven/turn";
const FORK_REF = "refs/aven/fork-base";
const FETCHED_BASE_REF = "refs/aven/fetched-base";
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const ZERO_SUMMARY: DiffSummary = { files: 0, additions: 0, deletions: 0 };
const IDENTITY = {
  GIT_AUTHOR_NAME: "Aven",
  GIT_AUTHOR_EMAIL: "aven@localhost",
  GIT_COMMITTER_NAME: "Aven",
  GIT_COMMITTER_EMAIL: "aven@localhost",
};

async function seedIndex(root: string, destination: string) {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const source = await open(join(root, ".git", "index"), flags).catch(() => null);

  if (!source) return false;

  try {
    const info = await source.stat();

    if (!info.isFile()) return false;

    await writeFile(destination, await source.readFile());
    const indexSecond = Math.floor(info.mtimeMs / 1000);
    await utimes(destination, indexSecond, indexSecond);
    return true;
  } catch {
    await rm(destination, { force: true }).catch(() => undefined);
    return false;
  } finally {
    await source.close();
  }
}

async function workingTree(root: string, run: Git) {
  const index = join(root, ".git", `aven-index-${randomUUID()}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    const seeded = await seedIndex(root, index);
    let added = await run(["add", "--all"], { cwd: root, env });

    if (added.code !== 0 && seeded) {
      await rm(index, { force: true });
      added = await run(["add", "--all"], { cwd: root, env });
    }

    if (added.code !== 0) return null;

    const written = await run(["write-tree"], { cwd: root, env });
    return written.code === 0 ? written.stdout.trim() : null;
  } finally {
    await rm(index, { force: true });
  }
}

async function markTree(root: string, ref: string, message: string, run: Git) {
  const saved = await withHostGit(
    root,
    async (host) => {
      const tree = await workingTree(root, host);

      if (!tree) return false;

      const commit = await host(["commit-tree", tree, "-m", message], { cwd: root, env: IDENTITY });

      if (commit.code !== 0) return false;

      const updated = await host(["update-ref", ref, commit.stdout.trim()], { cwd: root });
      return updated.code === 0;
    },
    run,
  );
  return saved === true;
}

export const markTurn = (root: string, run: Git = git) =>
  markTree(root, TURN_REF, "Start of a turn", run);

export const markFork = (root: string, run: Git = git) =>
  markTree(root, FORK_REF, "Start of a fork", run);

async function rememberFetchedBase(root: string, commits: readonly string[], run: Git) {
  for (const sha of commits) {
    const ancestor = await run(["merge-base", "--is-ancestor", sha, "HEAD"], { cwd: root });

    if (ancestor.code !== 0) continue;

    const already = await run(["merge-base", "--is-ancestor", sha, FETCHED_BASE_REF], {
      cwd: root,
    });

    if (already.code !== 0) await run(["update-ref", FETCHED_BASE_REF, sha], { cwd: root });

    return;
  }
}

async function pruneAncestors(root: string, commits: readonly string[], run: Git) {
  if (commits.length <= 1) return [...commits];

  const dominated = new Set<string>();
  await Promise.all(
    commits.flatMap((candidate, i) =>
      commits.flatMap((other, j) => {
        if (i === j) return [];

        return [
          run(["merge-base", "--is-ancestor", candidate, other], { cwd: root }).then((res) => {
            if (res.code === 0) dominated.add(candidate);
          }),
        ];
      }),
    ),
  );
  const kept = commits.filter((commit) => !dominated.has(commit));
  return kept.length > 0 ? kept : [commits[0]!];
}

async function branchPoints(
  root: string,
  run: Git,
  known: { remote: string | null; defaultBranch: string | null },
) {
  const [remoteRefs, fetched] = await Promise.all([
    remoteMainlineRefs(root, known.defaultBranch, run),
    fetchedMainlineCommits(root, known.defaultBranch),
  ]);

  if (fetched.length > 0) await rememberFetchedBase(root, fetched, run);

  const targets = [
    ...new Set(
      [known.remote, UPSTREAM_REF, FETCHED_BASE_REF, ...remoteRefs, ...fetched].filter(
        (target) => target !== null,
      ),
    ),
  ];
  const found = await Promise.all(
    targets.map(async (target) => {
      const base = await run(["merge-base", "HEAD", target], { cwd: root });
      return base.code === 0 ? base.stdout.trim() : null;
    }),
  );
  const points = [...new Set(found.filter((point) => point !== null))];

  if (points.length === 0) return ["HEAD"];

  return pruneAncestors(root, points, run);
}

async function resolveTrees(root: string, refs: readonly string[], run: Git) {
  if (refs.length === 0) return [];

  const resolved = await run(["rev-parse", ...refs.map((ref) => `${ref}^{tree}`)], { cwd: root });

  if (resolved.code === 0) {
    return [
      ...new Set(
        resolved.stdout.split("\n").flatMap((line) => {
          const trimmed = line.trim();
          return trimmed ? [trimmed] : [];
        }),
      ),
    ];
  }

  const individual = await Promise.all(
    refs.map((ref) => run(["rev-parse", "--verify", "--quiet", `${ref}^{tree}`], { cwd: root })),
  );
  return [...new Set(individual.flatMap((item) => (item.code === 0 ? [item.stdout.trim()] : [])))];
}

type RankedTree = {
  tree: string;
  summary: DiffSummary;
  score: number;
};

function parseNumstat(output: string): { summary: DiffSummary; score: number } {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  let score = 0;
  for (const line of output.split("\n")) {
    if (!line) continue;

    const [added = "", deleted = ""] = line.split("\t");
    files++;

    if (added === "-" || deleted === "-") {
      score += 1;
      continue;
    }

    const addCount = Number(added);
    const delCount = Number(deleted);
    additions += addCount;
    deletions += delCount;
    score += addCount + delCount + 1;
  }
  return { summary: { files, additions, deletions }, score };
}

async function numstatBetween(
  root: string,
  from: string,
  now: string,
  host: Git,
): Promise<RankedTree> {
  if (from === now) return { tree: from, summary: ZERO_SUMMARY, score: 0 };

  const stat = await host(["diff", "--numstat", "--no-renames", from, now], { cwd: root });

  if (stat.code !== 0) throw new Error("Could not compare the thread's changes");

  return { tree: from, ...parseNumstat(stat.stdout) };
}

async function pickNearestTree(root: string, trees: readonly string[], now: string, host: Git) {
  if (trees.includes(now)) {
    return { tree: now, summary: ZERO_SUMMARY, score: 0 };
  }

  if (trees.length === 1) return { tree: trees[0]!, summary: undefined, score: undefined };

  const ranked = await Promise.all(trees.map((tree) => numstatBetween(root, tree, now, host)));
  return ranked.reduce((best, next) => {
    if (next.score !== best.score) return next.score < best.score ? next : best;

    return next.summary.files < best.summary.files ? next : best;
  });
}

async function turnStart(root: string, run: Git) {
  const start = await run(["rev-parse", "--verify", "--quiet", `${TURN_REF}^{tree}`], {
    cwd: root,
  });
  return start.code === 0 ? start.stdout.trim() : null;
}

const PUSHED_COPIES = 5;

async function pushedTrees(root: string, run: Git, configure: Git, branch: string | null) {
  await trackPushes(root, configure);

  if (!branch) return [];

  const family = threadBranchFamily(branch);
  const patterns = family
    ? [`refs/remotes/origin/${family}`, `refs/remotes/origin/${family}-*`]
    : [`refs/remotes/origin/${branch}`];
  const listed = await run(
    [
      "for-each-ref",
      "--sort=-committerdate",
      `--count=${PUSHED_COPIES}`,
      "--format=%(objectname)",
      ...patterns,
    ],
    { cwd: root },
  );
  const commits = listed.stdout.split("\n").filter(Boolean);
  return resolveTrees(root, commits, run);
}

function cut(patch: string): { patch: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(patch);

  if (bytes.length <= MAX_PATCH_BYTES) return { patch, truncated: false };

  const head = new TextDecoder().decode(bytes.subarray(0, MAX_PATCH_BYTES));
  return { patch: head.slice(0, head.lastIndexOf("\n") + 1), truncated: true };
}

async function diffForTree(
  root: string,
  from: string,
  now: string,
  host: Git,
  summaryOnly: boolean,
  knownSummary?: DiffSummary,
): Promise<{ patch: string; truncated: boolean; summary?: DiffSummary }> {
  if (from === now) {
    return summaryOnly
      ? { patch: "", truncated: false, summary: ZERO_SUMMARY }
      : { patch: "", truncated: false };
  }

  if (summaryOnly) {
    const summary = knownSummary ?? (await numstatBetween(root, from, now, host)).summary;
    return { patch: "", truncated: false, summary };
  }

  return patchBetween(root, from, now, host);
}

export async function readThreadDiff(
  root: string,
  scope: DiffScope,
  options: { run?: Git; summaryOnly?: boolean; branchOnly?: boolean } = {},
): Promise<ThreadDiff | null> {
  const { run = git, summaryOnly = false, branchOnly = false } = options;
  return withHostGit(
    root,
    async (host) => {
      const readBranch = () =>
        host(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root }).then((found) =>
          found.code === 0 ? found.stdout.trim() : null,
        );

      if (branchOnly) {
        return { patch: "", truncated: false, branch: await readBranch() };
      }

      if (scope === "turn") {
        const [now, start, branch] = await Promise.all([
          workingTree(root, host),
          turnStart(root, host),
          readBranch(),
        ]);

        if (!now) return null;

        if (!start) {
          return summaryOnly
            ? { patch: "", truncated: false, branch, summary: ZERO_SUMMARY }
            : { patch: "", truncated: false, branch };
        }

        const diff = await diffForTree(root, start, now, host, summaryOnly);
        return { ...diff, branch };
      }

      const [now, branch, head, remote] = await Promise.all([
        workingTree(root, host),
        readBranch(),
        host(["rev-parse", "--verify", "--quiet", "HEAD"], { cwd: root }).then((rev) =>
          rev.code === 0 ? rev.stdout.trim() : "",
        ),
        remoteBase(root, host),
      ]);

      if (!now) return null;

      const defaultBranch = await defaultBranchOf(root, remote, host);
      await refreshBase(root, run, {
        host,
        base: remote,
        branch: defaultBranch,
        currentBranch: branch,
        head,
      });

      const [points, copies] = await Promise.all([
        branchPoints(root, host, { remote, defaultBranch }),
        scope === "unshipped" ? pushedTrees(root, host, run, branch) : Promise.resolve([]),
      ]);
      const baseTrees = await resolveTrees(root, points, host);
      const candidates = [...new Set([...copies, ...baseTrees])];

      if (candidates.length === 0) {
        return summaryOnly
          ? { patch: "", truncated: false, branch, summary: ZERO_SUMMARY }
          : { patch: "", truncated: false, branch };
      }

      const winner = await pickNearestTree(root, candidates, now, host);
      const diff = await diffForTree(root, winner.tree, now, host, summaryOnly, winner.summary);
      return { ...diff, branch };
    },
    run,
  );
}

export async function threadDiff(
  root: string,
  scope: DiffScope,
  run: Git = git,
): Promise<ThreadDiff | null> {
  const result = await readThreadDiff(root, scope, { run });

  if (!result) return null;

  return { patch: result.patch, truncated: result.truncated };
}

export async function currentBranch(root: string, run: Git = git) {
  const found = await hostGit(run)(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root });
  return found.code === 0 ? found.stdout.trim() : null;
}

export async function forkChanges(root: string): Promise<ThreadDiff | null> {
  return withHostGit(root, async (host) => {
    const [now, start] = await Promise.all([
      workingTree(root, host),
      host(["rev-parse", "--verify", "--quiet", `${FORK_REF}^{tree}`], { cwd: root }),
    ]);

    if (!now || start.code !== 0) return null;

    const from = start.stdout.trim();
    return from === now ? { patch: "", truncated: false } : patchBetween(root, from, now, host);
  });
}

async function patchBetween(root: string, from: string, now: string, host: Git) {
  const diff = await host(
    [
      "-c",
      "core.quotepath=false",
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--find-renames",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      from,
      now,
    ],
    { cwd: root },
  );

  if (diff.code !== 0) throw new Error("Could not compare the thread's changes");

  return cut(diff.stdout);
}
