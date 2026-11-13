import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";

import type {
  FolderCommit,
  FolderFileEntry,
  FoldersCommitsResult,
  FoldersFilesResult,
  FoldersReadmeResult,
} from "@aven/protocol/types";

import { resolved, servedPath } from "./folder-browser";
import { runCommand } from "./run-command";

const ENTRIES_MAX = 2000;
const README_MAX_CHARS = 200_000;
const COMMITS_PER_PAGE = 10;
const COMMIT_MESSAGE_MAX = 200;
const COMMITS_TIMEOUT_MS = 10_000;
const README_NAMES = ["readme.md", "readme.markdown", "readme.mdx", "readme"];

async function insideFolder(dirs: readonly string[], folder: string, path: string) {
  const root = await servedPath(await resolved(dirs), folder);
  const target = await realpath(join(root, path)).catch(() => {
    throw new Error(`${path || "The folder"} is not in the folder`);
  });

  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`${path} is outside the folder`);
  }

  return { root, target };
}

async function kindOf(path: string): Promise<FolderFileEntry["type"]> {
  const found = await stat(path).catch(() => undefined);
  return found?.isDirectory() ? "directory" : "file";
}

export async function listFiles(
  dirs: readonly string[],
  folder: string,
  path = "",
): Promise<FoldersFilesResult> {
  const { target } = await insideFolder(dirs, folder, path);
  const names = await readdir(target);
  const entries = await Promise.all(
    names
      .filter((name) => name !== ".git")
      .slice(0, ENTRIES_MAX)
      .map(async (name) => ({
        name,
        path: path === "" ? name : `${path}/${name}`,
        type: await kindOf(join(target, name)),
      })),
  );
  entries.sort(
    (a, b) =>
      Number(b.type === "directory") - Number(a.type === "directory") ||
      a.name.localeCompare(b.name),
  );
  return { entries };
}

export async function readReadme(
  dirs: readonly string[],
  folder: string,
): Promise<FoldersReadmeResult> {
  const { target } = await insideFolder(dirs, folder, "");
  const names = await readdir(target);
  const name = README_NAMES.map((wanted) =>
    names.find((candidate) => candidate.toLowerCase() === wanted),
  ).find((found) => found !== undefined);

  if (!name) return { readme: null };

  const real = await realpath(join(target, name)).catch(() => undefined);

  if (!real || !real.startsWith(target + sep) || (await kindOf(real)) !== "file") {
    return { readme: null };
  }

  const text = await readFile(real, "utf8");
  return {
    readme: {
      name,
      path: name,
      text: text.slice(0, README_MAX_CHARS),
      truncated: text.length > README_MAX_CHARS,
    },
  };
}

const FIELD = "\u001f";
const RECORD = "\u001e";
const NO_COMMITS = /not a git repository|does not have any commits|unknown revision/i;

function commitOf(record: string): FolderCommit {
  const [sha = "", parents = "", author = "", date = "", decoration = "", message = ""] = record
    .trim()
    .split(FIELD);
  const names = decoration.split(",").flatMap((name) => {
    const ref = name.trim().replace(/^HEAD -> /, "");
    return ref ? [ref] : [];
  });
  return {
    sha,
    message: message.trim().slice(0, COMMIT_MESSAGE_MAX),
    author: author || null,
    authorAvatar: null,
    date,
    parents: parents.split(" ").filter(Boolean),
    refs: names.filter(
      (name) =>
        !name.startsWith("tag: ") &&
        !name.includes("/HEAD") &&
        name !== "HEAD" &&
        !name.startsWith("origin/"),
    ),
    tags: names.flatMap((name) => (name.startsWith("tag: ") ? [name.slice(5)] : [])),
  };
}

export async function listCommits(
  dirs: readonly string[],
  folder: string,
  page = 1,
): Promise<FoldersCommitsResult> {
  const { target } = await insideFolder(dirs, folder, "");
  const top = await runCommand(["git", "rev-parse", "--show-toplevel"], {
    cwd: target,
    timeoutMs: COMMITS_TIMEOUT_MS,
  });
  const root =
    top.code === 0 ? await realpath(top.stdout.trim()).catch(() => undefined) : undefined;

  if (root !== target) return { commits: [], hasMore: false };

  const format = ["%H", "%P", "%an", "%aI", "%D", "%s"].join("%x1f") + "%x1e";
  const done = await runCommand(
    [
      "git",
      "--no-pager",
      "log",
      "HEAD",
      `--skip=${(page - 1) * COMMITS_PER_PAGE}`,
      `-n${COMMITS_PER_PAGE + 1}`,
      "--decorate=short",
      `--format=${format}`,
    ],
    { cwd: target, timeoutMs: COMMITS_TIMEOUT_MS },
  );

  if (done.code !== 0) {
    if (NO_COMMITS.test(done.stderr)) return { commits: [], hasMore: false };

    throw new Error(`git log failed: ${done.stderr.trim().slice(0, 200)}`);
  }

  const records = done.stdout.split(RECORD).filter((record) => record.trim() !== "");
  return {
    commits: records.slice(0, COMMITS_PER_PAGE).map(commitOf),
    hasMore: records.length > COMMITS_PER_PAGE,
  };
}
