import { lstat, realpath } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import type {
  GitActionAuth,
  GitBranchInfo,
  GitCommitDiffResult,
  GitCommitEntry,
  GitConflictOperation,
  GitConflictState,
  GitReflogEntry,
  GitReflogResult,
  GitRemoteRef,
  GitSnapshotParams,
  GitSnapshotResult,
  GitStashInfo,
  GitTagInfo,
  GitThreadWorkspaceSummary,
  GitWipSummary,
  GitWorktreeInfo,
  GitWorkspaceFileStatus,
  GitWorkspaceStatusFile,
  GitWorkspaceStatusResult,
} from "@aven/protocol/types";

import { runCommand } from "./run-command";
import { gitFailure } from "./host-git";

const FIELD = "\u001f";
const RECORD = "\u001e";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;
const DEFAULT_REFLOG_LIMIT = 30;
const MAX_PATCH_BYTES = 512 * 1024;
const GIT_TIMEOUT_MS = 30_000;
const NETWORK_TIMEOUT_MS = 90_000;
const MAX_THREAD_WORKSPACES = 25;
const SHA_RE = /^[0-9a-f]{4,64}$/i;

const SAFE_GIT_ARGS = [
  "--no-pager",
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

const NO_COMMITS_RE =
  /not a git repository|does not have any commits|unknown revision|bad default revision/i;

export function authGitEnv(auth?: GitActionAuth): Record<string, string> {
  const env: Record<string, string> = {
    GIT_TERMINAL_PROMPT: "0",
    GIT_EDITOR: "true",
    LC_ALL: "C",
  };

  if (auth?.token) {
    const basic = Buffer.from(`x-access-token:${auth.token}`).toString("base64");
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basic}`;
  }

  return env;
}

export async function runCenterGit(
  cwd: string,
  args: string[],
  options: { auth?: GitActionAuth; timeoutMs?: number; extraEnv?: Record<string, string> } = {},
) {
  const env = { ...authGitEnv(options.auth), ...options.extraEnv };
  return runCommand(["git", ...SAFE_GIT_ARGS, ...args], {
    cwd,
    env,
    timeoutMs: options.timeoutMs ?? GIT_TIMEOUT_MS,
  });
}

export async function runCenterNetworkGit(cwd: string, args: string[], auth?: GitActionAuth) {
  return runCenterGit(cwd, args, { auth, timeoutMs: NETWORK_TIMEOUT_MS });
}

export function assertSafeRef(value: string, label = "ref") {
  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > 256 ||
    trimmed.startsWith("-") ||
    /[\0\r\n\t\s~^:?*[\\]/.test(trimmed) ||
    trimmed.includes("..")
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return trimmed;
}

export function assertSafeRevision(value: string, label = "revision") {
  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > 256 ||
    trimmed.startsWith("-") ||
    /[\0\r\n\t\s]/.test(trimmed)
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return trimmed;
}

export function assertSafeSha(sha: string) {
  const trimmed = sha.trim();

  if (!SHA_RE.test(trimmed)) throw new Error(`Invalid commit SHA: ${sha}`);

  return trimmed;
}

export function assertRelativeRepoPath(root: string, filePath: string) {
  if (
    filePath.length === 0 ||
    filePath.length > 4096 ||
    filePath.includes("\0") ||
    filePath.startsWith("-")
  ) {
    throw new Error(`Invalid file path: ${filePath}`);
  }

  const resolvedTarget = resolve(root, filePath);
  const rel = relative(root, resolvedTarget);

  if (rel === "" || rel.startsWith("..") || rel.startsWith(sep)) {
    throw new Error(`Path is outside repository: ${filePath}`);
  }

  return filePath;
}

export async function resolveRepoRoot(dir: string): Promise<string | null> {
  const realDir = await realpath(dir).catch(() => null);

  if (!realDir) return null;

  const top = await runCenterGit(realDir, ["rev-parse", "--show-toplevel"]);

  if (top.code !== 0) return null;

  const root = await realpath(top.stdout.trim()).catch(() => null);
  return root;
}

export async function resolveGitDir(root: string): Promise<string | null> {
  const out = await runCenterGit(root, ["rev-parse", "--absolute-git-dir"]);

  if (out.code !== 0) return null;

  return out.stdout.trim() || null;
}

export async function resolveGitCommonDir(root: string): Promise<string | null> {
  const out = await runCenterGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);

  if (out.code !== 0) return resolveGitDir(root);

  return out.stdout.trim() || null;
}

async function fileExists(path: string) {
  return (await lstat(path).catch(() => null)) !== null;
}

function emptyWip(): GitWipSummary {
  return { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, additions: 0, deletions: 0 };
}

function statusFromXY(x: string, y: string): GitWorkspaceFileStatus {
  if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
    return "conflicted";
  }

  const code = x !== "." ? x : y;

  if (code === "A") return "added";

  if (code === "D") return "deleted";

  if (code === "R") return "renamed";

  if (code === "C") return "copied";

  return "modified";
}

function parsePorcelainV2(stdout: string) {
  let headBranch: string | null = null;
  let headSha: string | null = null;
  let detached = false;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const files: GitWorkspaceStatusFile[] = [];
  const conflictedFiles: string[] = [];
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const line of stdout.split("\n")) {
    if (!line) continue;

    if (line.startsWith("# branch.oid ")) {
      const oid = line.slice("# branch.oid ".length).trim();
      headSha = oid === "(initial)" ? null : oid;
      continue;
    }

    if (line.startsWith("# branch.head ")) {
      const head = line.slice("# branch.head ".length).trim();

      if (head === "(detached)") {
        detached = true;
        headBranch = null;
      } else {
        headBranch = head;
      }

      continue;
    }

    if (line.startsWith("# branch.upstream ")) {
      upstream = line.slice("# branch.upstream ".length).trim() || null;
      continue;
    }

    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+)\s+-(\d+)/);

      if (match) {
        ahead = Number(match[1]);
        behind = Number(match[2]);
      }

      continue;
    }

    if (line.startsWith("? ")) {
      const path = line.slice(2);
      untracked += 1;
      files.push({ path, oldPath: null, status: "untracked", staged: false, unstaged: true });
      continue;
    }

    if (line.startsWith("u ")) {
      const parts = line.split(" ");
      const path = parts.slice(10).join(" ");

      if (path) {
        conflictedFiles.push(path);
        files.push({ path, oldPath: null, status: "conflicted", staged: false, unstaged: true });
      }

      continue;
    }

    if (line.startsWith("1 ")) {
      const parts = line.split(" ");
      const xy = parts[1] ?? "..";
      const x = xy[0] ?? ".";
      const y = xy[1] ?? ".";
      const path = parts.slice(8).join(" ");

      if (!path) continue;

      const isStaged = x !== ".";
      const isUnstaged = y !== ".";

      if (isStaged) staged += 1;

      if (isUnstaged) unstaged += 1;

      files.push({
        path,
        oldPath: null,
        status: statusFromXY(x, y),
        staged: isStaged,
        unstaged: isUnstaged,
      });
      continue;
    }

    if (line.startsWith("2 ")) {
      const tabIndex = line.indexOf("\t");
      const headPart = tabIndex >= 0 ? line.slice(0, tabIndex) : line;
      const oldPath = tabIndex >= 0 ? line.slice(tabIndex + 1) : null;
      const parts = headPart.split(" ");
      const xy = parts[1] ?? "..";
      const x = xy[0] ?? ".";
      const y = xy[1] ?? ".";
      const path = parts.slice(9).join(" ");

      if (!path) continue;

      const isStaged = x !== ".";
      const isUnstaged = y !== ".";

      if (isStaged) staged += 1;

      if (isUnstaged) unstaged += 1;

      files.push({
        path,
        oldPath,
        status: statusFromXY(x, y),
        staged: isStaged,
        unstaged: isUnstaged,
      });
    }
  }

  return {
    headBranch,
    headSha,
    detached,
    upstream,
    ahead,
    behind,
    files,
    conflictedFiles,
    wipCounts: { staged, unstaged, untracked, conflicted: conflictedFiles.length },
  };
}

function parseNumstat(stdout: string) {
  let additions = 0;
  let deletions = 0;

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;

    const [add, del] = line.split("\t");
    const a = Number(add);
    const d = Number(del);

    if (Number.isFinite(a)) additions += a;

    if (Number.isFinite(d)) deletions += d;
  }

  return { additions, deletions };
}

export async function detectConflictState(
  root: string,
  conflictedFiles: string[],
): Promise<GitConflictState | null> {
  const gitDir = await resolveGitDir(root);

  if (!gitDir)
    return conflictedFiles.length > 0 ? { operation: "merge", files: conflictedFiles } : null;

  const [isMerge, isRebaseMerge, isRebaseApply, isCherryPick, isRevert] = await Promise.all([
    fileExists(join(gitDir, "MERGE_HEAD")),
    fileExists(join(gitDir, "rebase-merge")),
    fileExists(join(gitDir, "rebase-apply")),
    fileExists(join(gitDir, "CHERRY_PICK_HEAD")),
    fileExists(join(gitDir, "REVERT_HEAD")),
  ]);

  let operation: GitConflictOperation | null = null;

  if (isRebaseMerge || isRebaseApply) operation = "rebase";
  else if (isMerge) operation = "merge";
  else if (isCherryPick) operation = "cherry-pick";
  else if (isRevert) operation = "revert";
  else if (conflictedFiles.length > 0) operation = "merge";

  if (!operation) return null;

  return { operation, files: conflictedFiles };
}

function parseAheadBehind(track: string) {
  let ahead = 0;
  let behind = 0;
  const gone = track.includes("gone");
  const aheadMatch = track.match(/ahead (\d+)/);
  const behindMatch = track.match(/behind (\d+)/);

  if (aheadMatch) ahead = Number(aheadMatch[1]);

  if (behindMatch) behind = Number(behindMatch[1]);

  return { ahead, behind, gone };
}

async function detectDefaultBranch(root: string, localNames: Set<string>): Promise<string | null> {
  const sym = await runCenterGit(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);

  if (sym.code === 0) {
    const cleaned = sym.stdout.trim().replace(/^origin\//, "");

    if (cleaned) return cleaned;
  }

  if (localNames.has("main")) return "main";

  if (localNames.has("master")) return "master";

  const first = [...localNames][0];
  return first ?? null;
}

function parseWorktrees(stdout: string, mainRoot: string): GitWorktreeInfo[] {
  const blocks = stdout.trim().split(/\n\n+/);
  const result: GitWorktreeInfo[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;

    let path = "";
    let sha: string | null = null;
    let branch: string | null = null;
    let detached = false;
    let bare = false;
    let locked = false;
    let prunable = false;

    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length).trim();
      else if (line.startsWith("HEAD ")) sha = line.slice("HEAD ".length).trim() || null;
      else if (line.startsWith("branch ")) {
        branch = line
          .slice("branch ".length)
          .trim()
          .replace(/^refs\/heads\//, "");
      } else if (line === "detached") detached = true;
      else if (line === "bare") bare = true;
      else if (line.startsWith("locked")) locked = true;
      else if (line.startsWith("prunable")) prunable = true;
    }

    if (!path) continue;

    result.push({
      path,
      sha,
      branch,
      detached,
      bare,
      locked,
      prunable,
      isMain: path === mainRoot,
    });
  }

  return result;
}

function parseCommitRecord(record: string): GitCommitEntry | null {
  const trimmed = record.trim();

  if (!trimmed) return null;

  const [
    sha = "",
    parentsRaw = "",
    author = "",
    authorEmail = "",
    date = "",
    decoration = "",
    subject = "",
    body = "",
  ] = trimmed.split(FIELD);

  if (!sha) return null;

  const refs: string[] = [];
  const remoteRefs: string[] = [];
  const tags: string[] = [];

  for (const raw of decoration.split(",")) {
    const item = raw.trim();

    if (!item || item === "HEAD" || item.endsWith("/HEAD")) continue;

    if (item.startsWith("tag: ")) {
      tags.push(item.slice(5).trim());
      continue;
    }

    const cleaned = item.startsWith("HEAD -> ") ? item.slice("HEAD -> ".length).trim() : item;

    if (!cleaned) continue;

    if (cleaned.includes("/")) {
      const slash = cleaned.indexOf("/");
      const maybeRemote = cleaned.slice(0, slash);

      if (maybeRemote === "origin" || maybeRemote === "upstream") {
        remoteRefs.push(cleaned);
        continue;
      }
    }

    refs.push(cleaned);
  }

  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: subject.trim().slice(0, 240),
    body: body.trim().slice(0, 2000),
    author: author || null,
    authorEmail: authorEmail || null,
    date,
    parents: parentsRaw.split(" ").filter(Boolean),
    refs,
    remoteRefs,
    tags,
  };
}

function truncatePatch(patch: string) {
  const bytes = Buffer.byteLength(patch, "utf8");

  if (bytes <= MAX_PATCH_BYTES) return { patch, truncated: false };

  return {
    patch: Buffer.from(patch, "utf8").subarray(0, MAX_PATCH_BYTES).toString("utf8"),
    truncated: true,
  };
}

async function readLightweightWorkspace(
  threadId: string,
  root: string,
): Promise<GitThreadWorkspaceSummary | null> {
  const repoRoot = await resolveRepoRoot(root);

  if (!repoRoot) return null;

  const [statusOut, unstagedNum, stagedNum] = await Promise.all([
    runCenterGit(repoRoot, ["status", "--porcelain=v2", "--branch", "-uall"]),
    runCenterGit(repoRoot, ["diff", "--numstat"]),
    runCenterGit(repoRoot, ["diff", "--cached", "--numstat"]),
  ]);

  if (statusOut.code !== 0) return null;

  const parsed = parsePorcelainV2(statusOut.stdout);
  const a = parseNumstat(unstagedNum.stdout);
  const b = parseNumstat(stagedNum.stdout);
  const conflicts = await detectConflictState(repoRoot, parsed.conflictedFiles);
  return {
    threadId,
    branch: parsed.headBranch,
    headSha: parsed.headSha,
    wip: {
      ...parsed.wipCounts,
      additions: a.additions + b.additions,
      deletions: a.deletions + b.deletions,
    },
    conflicts,
  };
}

export async function readGitSnapshot(
  folderRoot: string,
  params: Omit<GitSnapshotParams, "folder">,
  resolveThreadRoot?: (threadId: string) => Promise<string | null | undefined>,
): Promise<GitSnapshotResult> {
  const root = await resolveRepoRoot(folderRoot);

  if (!root) {
    return {
      isRepo: false,
      root: null,
      headBranch: null,
      headSha: null,
      detached: false,
      defaultBranch: null,
      branches: [],
      remotes: [],
      tags: [],
      stashes: [],
      worktrees: [],
      conflicts: null,
      wip: emptyWip(),
      commits: [],
      hasMore: false,
      threadWorkspaces: [],
    };
  }

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(MAX_LIMIT, Math.max(10, params.limit ?? DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const logArgs = ["log", "--topo-order", `--skip=${skip}`, `-n${limit + 1}`, "--decorate=short"];

  if (params.branch) {
    logArgs.push(assertSafeRevision(params.branch, "branch"));
  } else {
    logArgs.push("--all");
  }

  if (params.author?.trim()) {
    logArgs.push(`--author=${params.author.trim()}`);
  }

  if (params.search?.trim()) {
    logArgs.push(`--grep=${params.search.trim()}`, "-i");
  }

  const logFormat = ["%H", "%P", "%an", "%ae", "%aI", "%D", "%s", "%b"].join("%x1f") + "%x1e";
  logArgs.push(`--format=${logFormat}`);

  if (params.path?.trim()) {
    logArgs.push("--", assertRelativeRepoPath(root, params.path.trim()));
  }

  const headRefFormat = [
    "%(refname:short)",
    "%(objectname)",
    "%(HEAD)",
    "%(upstream:short)",
    "%(upstream:track)",
    "%(committerdate:iso-strict)",
  ].join("%1f");

  const remoteRefFormat = ["%(refname:short)", "%(objectname)"].join("%1f");
  const tagFormat = ["%(refname:short)", "%(objectname)", "%(creatordate:iso-strict)"].join("%1f");
  const stashFormat = ["%gd", "%H", "%aI", "%gs"].join("%x1f");

  const [
    statusOut,
    unstagedNum,
    stagedNum,
    headsOut,
    remotesOut,
    tagsOut,
    stashesOut,
    worktreesOut,
    logOut,
  ] = await Promise.all([
    runCenterGit(root, ["status", "--porcelain=v2", "--branch", "-uall"]),
    runCenterGit(root, ["diff", "--numstat"]),
    runCenterGit(root, ["diff", "--cached", "--numstat"]),
    runCenterGit(root, [
      "for-each-ref",
      "--sort=-committerdate",
      `--format=${headRefFormat}`,
      "refs/heads",
    ]),
    runCenterGit(root, [
      "for-each-ref",
      "--sort=-committerdate",
      `--format=${remoteRefFormat}`,
      "refs/remotes",
    ]),
    runCenterGit(root, [
      "for-each-ref",
      "--sort=-creatordate",
      `--format=${tagFormat}`,
      "refs/tags",
    ]),
    runCenterGit(root, ["stash", "list", `--format=${stashFormat}`]),
    runCenterGit(root, ["worktree", "list", "--porcelain"]),
    runCenterGit(root, logArgs),
  ]);

  const parsedStatus = parsePorcelainV2(statusOut.code === 0 ? statusOut.stdout : "");
  const unstagedStats = parseNumstat(unstagedNum.stdout);
  const stagedStats = parseNumstat(stagedNum.stdout);
  const wip: GitWipSummary = {
    ...parsedStatus.wipCounts,
    additions: unstagedStats.additions + stagedStats.additions,
    deletions: unstagedStats.deletions + stagedStats.deletions,
  };

  const rawBranches =
    headsOut.code === 0
      ? headsOut.stdout.split("\n").flatMap((line) => {
          if (line.trim() === "") return [];

          const [name = "", sha = "", headMark = "", upstream = "", track = "", date = ""] =
            line.split(FIELD);
          const { ahead, behind, gone } = parseAheadBehind(track);
          return [
            {
              name,
              sha,
              current: headMark.trim() === "*",
              upstream: upstream || null,
              ahead,
              behind,
              gone,
              merged: false,
              lastCommitDate: date || null,
            },
          ];
        })
      : [];

  const localNames = new Set(rawBranches.map((b) => b.name));
  const defaultBranch = await detectDefaultBranch(root, localNames);

  const mergedSet = new Set<string>();

  if (defaultBranch) {
    const mergedRef = localNames.has(defaultBranch)
      ? defaultBranch
      : `refs/remotes/origin/${defaultBranch}`;
    const mergedOut = await runCenterGit(root, [
      "branch",
      "--merged",
      mergedRef,
      "--format=%(refname:short)",
    ]);

    if (mergedOut.code === 0) {
      for (const name of mergedOut.stdout.split("\n")) {
        const cleaned = name.trim();

        if (cleaned) mergedSet.add(cleaned);
      }
    }
  }

  const branches: GitBranchInfo[] = rawBranches.map((branch) => ({
    ...branch,
    merged: branch.name !== defaultBranch && mergedSet.has(branch.name),
  }));

  const remotes: GitRemoteRef[] =
    remotesOut.code === 0
      ? remotesOut.stdout.split("\n").flatMap((line) => {
          if (!line.trim()) return [];

          const [fullName = "", sha = ""] = line.split(FIELD);

          if (!fullName || fullName.endsWith("/HEAD")) return [];

          const slash = fullName.indexOf("/");

          if (slash <= 0) return [];

          return [
            {
              remote: fullName.slice(0, slash),
              name: fullName.slice(slash + 1),
              fullName,
              sha,
            },
          ];
        })
      : [];

  const tags: GitTagInfo[] =
    tagsOut.code === 0
      ? tagsOut.stdout.split("\n").flatMap((line) => {
          if (!line.trim()) return [];

          const [name = "", sha = "", date = ""] = line.split(FIELD);
          return name ? [{ name, sha, date: date || null }] : [];
        })
      : [];

  const stashes: GitStashInfo[] =
    stashesOut.code === 0
      ? stashesOut.stdout.split("\n").flatMap((line, index) => {
          if (!line.trim()) return [];

          const [ref = `stash@{${index}}`, sha = "", date = "", message = ""] = line.split(FIELD);
          return [{ index, ref, sha, date, message }];
        })
      : [];

  const worktrees = worktreesOut.code === 0 ? parseWorktrees(worktreesOut.stdout, root) : [];

  let commits: GitCommitEntry[] = [];
  let hasMore = false;

  if (logOut.code === 0) {
    const records = logOut.stdout.split(RECORD).flatMap((record) => {
      const parsed = parseCommitRecord(record);
      return parsed ? [parsed] : [];
    });
    hasMore = records.length > limit;
    commits = hasMore ? records.slice(0, limit) : records;
  } else if (!NO_COMMITS_RE.test(logOut.stderr)) {
    throw gitFailure("Could not read git history", logOut);
  }

  if (params.search?.trim() && SHA_RE.test(params.search.trim()) && commits.length === 0) {
    const exact = await runCenterGit(root, [
      "show",
      "--no-patch",
      "--decorate=short",
      `--format=${logFormat}`,
      assertSafeSha(params.search.trim()),
    ]);

    if (exact.code === 0) {
      const found = parseCommitRecord(exact.stdout.split(RECORD)[0] ?? "");

      if (found) commits = [found];
    }
  }

  const [conflicts, threadWorkspaces] = await Promise.all([
    detectConflictState(root, parsedStatus.conflictedFiles),
    resolveThreadRoot && params.threadIds?.length
      ? Promise.all(
          params.threadIds.slice(0, MAX_THREAD_WORKSPACES).map(async (threadId) => {
            const wsRoot = await resolveThreadRoot(threadId).catch(() => null);
            return wsRoot ? readLightweightWorkspace(threadId, wsRoot) : null;
          }),
        ).then((list) => list.flatMap((item) => (item ? [item] : [])))
      : Promise.resolve([]),
  ]);

  return {
    isRepo: true,
    root,
    headBranch: parsedStatus.headBranch,
    headSha: parsedStatus.headSha,
    detached: parsedStatus.detached,
    defaultBranch,
    branches,
    remotes,
    tags,
    stashes,
    worktrees,
    conflicts,
    wip,
    commits,
    hasMore,
    threadWorkspaces,
  };
}

export async function readGitCommitDiff(
  folderRoot: string,
  shaInput: string,
): Promise<GitCommitDiffResult> {
  const root = await resolveRepoRoot(folderRoot);

  if (!root) throw new Error("Not a git repository");

  const sha = assertSafeSha(shaInput);
  const metaFormat = ["%H", "%P", "%an", "%ae", "%aI", "%s", "%b"].join("%x1f");
  const [metaOut, numstatOut, patchOut] = await Promise.all([
    runCenterGit(root, ["show", "--no-patch", `--format=${metaFormat}`, sha]),
    runCenterGit(root, ["show", "--format=", "--numstat", "--first-parent", sha]),
    runCenterGit(root, ["show", "--format=", "--patch", "--no-color", "--first-parent", sha]),
  ]);

  if (metaOut.code !== 0) throw gitFailure("Could not read commit", metaOut);

  const [
    fullSha = sha,
    parentsRaw = "",
    author = "",
    authorEmail = "",
    date = "",
    subject = "",
    body = "",
  ] = metaOut.stdout.trim().split(FIELD);
  const stats = parseNumstat(numstatOut.stdout);
  const filesChanged = numstatOut.stdout.split("\n").filter((line) => line.trim() !== "").length;
  const { patch, truncated } = truncatePatch(patchOut.stdout);

  return {
    sha: fullSha,
    message: subject.trim(),
    body: body.trim(),
    author: author || null,
    authorEmail: authorEmail || null,
    date,
    parents: parentsRaw.split(" ").filter(Boolean),
    patch,
    truncated,
    additions: stats.additions,
    deletions: stats.deletions,
    filesChanged,
  };
}

export async function readGitWorkspaceStatus(
  workspaceRoot: string,
  options: { filePath?: string; staged?: boolean } = {},
): Promise<GitWorkspaceStatusResult> {
  const root = await resolveRepoRoot(workspaceRoot);

  if (!root) throw new Error("Not a git repository");

  const [statusOut, unstagedNum, stagedNum] = await Promise.all([
    runCenterGit(root, ["status", "--porcelain=v2", "--branch", "-uall"]),
    runCenterGit(root, ["diff", "--numstat"]),
    runCenterGit(root, ["diff", "--cached", "--numstat"]),
  ]);

  if (statusOut.code !== 0) throw gitFailure("Could not read workspace status", statusOut);

  const parsed = parsePorcelainV2(statusOut.stdout);
  const a = parseNumstat(unstagedNum.stdout);
  const b = parseNumstat(stagedNum.stdout);
  const conflicts = await detectConflictState(root, parsed.conflictedFiles);
  const wip: GitWipSummary = {
    ...parsed.wipCounts,
    additions: a.additions + b.additions,
    deletions: a.deletions + b.deletions,
  };

  let rawPatch = "";

  if (options.filePath) {
    const safePath = assertRelativeRepoPath(root, options.filePath);
    const matching = parsed.files.find((f) => f.path === safePath);

    if (matching?.status === "untracked") {
      const noIndex = await runCenterGit(root, [
        "diff",
        "--no-color",
        "--no-index",
        "--",
        "/dev/null",
        safePath,
      ]);
      rawPatch = noIndex.stdout;
    } else if (options.staged) {
      const diff = await runCenterGit(root, ["diff", "--no-color", "--cached", "--", safePath]);
      rawPatch = diff.stdout;
    } else {
      const diff = await runCenterGit(root, ["diff", "--no-color", "--", safePath]);
      rawPatch = diff.stdout;
    }
  } else if (options.staged === true) {
    const diff = await runCenterGit(root, ["diff", "--no-color", "--cached"]);
    rawPatch = diff.stdout;
  } else if (options.staged === false) {
    const diff = await runCenterGit(root, ["diff", "--no-color"]);
    rawPatch = diff.stdout;
  } else {
    const [stagedDiff, unstagedDiff] = await Promise.all([
      runCenterGit(root, ["diff", "--no-color", "--cached"]),
      runCenterGit(root, ["diff", "--no-color"]),
    ]);
    rawPatch = [stagedDiff.stdout, unstagedDiff.stdout].filter(Boolean).join("\n");
  }

  const { patch, truncated } = truncatePatch(rawPatch);

  return {
    branch: parsed.headBranch,
    headSha: parsed.headSha,
    detached: parsed.detached,
    conflicts,
    files: parsed.files,
    patch,
    truncated,
    wip,
  };
}

export async function readGitReflog(
  workspaceRoot: string,
  limit = DEFAULT_REFLOG_LIMIT,
): Promise<GitReflogResult> {
  const root = await resolveRepoRoot(workspaceRoot);

  if (!root) throw new Error("Not a git repository");

  const capped = Math.min(100, Math.max(1, limit));
  const format = ["%gd", "%H", "%cI", "%gs"].join("%x1f") + "%x1e";
  const out = await runCenterGit(root, ["reflog", `--format=${format}`, `-n${capped}`]);

  if (out.code !== 0) {
    if (NO_COMMITS_RE.test(out.stderr)) return { entries: [] };

    throw gitFailure("Could not read reflog", out);
  }

  const entries: GitReflogEntry[] = out.stdout.split(RECORD).flatMap((record, index) => {
    const trimmed = record.trim();

    if (!trimmed) return [];

    const [selector = `HEAD@{${index}}`, sha = "", date = "", rawMsg = ""] = trimmed.split(FIELD);

    if (!sha) return [];

    const colon = rawMsg.indexOf(":");
    const action = colon > 0 ? rawMsg.slice(0, colon).trim() : "git";
    const message = colon > 0 ? rawMsg.slice(colon + 1).trim() : rawMsg.trim();
    return [
      {
        index,
        selector,
        sha,
        shortSha: sha.slice(0, 7),
        action,
        message,
        date,
      },
    ];
  });

  return { entries };
}
