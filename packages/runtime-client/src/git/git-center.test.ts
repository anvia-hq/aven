import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readGitCommitDiff,
  readGitReflog,
  readGitSnapshot,
  readGitWorkspaceStatus,
  runCenterGit,
} from "./git-center";
import { runGitAction } from "./git-center-actions";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop();

    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function createTempRepo() {
  const dir = await mkdtemp(join(tmpdir(), "aven-git-center-"));
  cleanupDirs.push(dir);
  await runCenterGit(dir, ["init", "-b", "main"]);
  await runCenterGit(dir, ["config", "user.name", "Test User"]);
  await runCenterGit(dir, ["config", "user.email", "test@example.com"]);
  await writeFile(join(dir, "README.md"), "# Hello\n");
  await runCenterGit(dir, ["add", "README.md"]);
  await runCenterGit(dir, ["commit", "-m", "Initial commit"]);
  return dir;
}

describe("git-center runner engine", () => {
  test("reads multi-branch snapshot, WIP summary, and commit diffs", async () => {
    const repo = await createTempRepo();
    await runGitAction(repo, { op: "branch.create", name: "feat/demo", checkout: true });
    await writeFile(join(repo, "app.ts"), "export const x = 1;\n");
    await runGitAction(repo, { op: "stage", paths: ["app.ts"] });
    await runGitAction(repo, { op: "commit", message: "Add app.ts" });

    await writeFile(join(repo, "app.ts"), "export const x = 2;\n");
    await writeFile(join(repo, "notes.txt"), "draft\n");

    const snapshot = await readGitSnapshot(repo, {});
    expect(snapshot.isRepo).toBe(true);
    expect(snapshot.headBranch).toBe("feat/demo");
    expect(snapshot.defaultBranch).toBe("main");
    expect(snapshot.branches.map((b) => b.name).sort()).toEqual(["feat/demo", "main"]);
    expect(snapshot.commits.length).toBe(2);
    expect(snapshot.wip.unstaged).toBe(1);
    expect(snapshot.wip.untracked).toBe(1);

    const latestSha = snapshot.commits[0]!.sha;
    const diff = await readGitCommitDiff(repo, latestSha);
    expect(diff.message).toBe("Add app.ts");
    expect(diff.filesChanged).toBe(1);
    expect(diff.patch).toContain("export const x = 1;");

    const status = await readGitWorkspaceStatus(repo, { filePath: "notes.txt" });
    expect(status.files.some((f) => f.path === "notes.txt" && f.status === "untracked")).toBe(true);
    expect(status.patch).toContain("+draft");
  });

  test("handles stage, unstage, discard, stash, and reflog recovery", async () => {
    const repo = await createTempRepo();
    await writeFile(join(repo, "README.md"), "# Updated\n");
    await writeFile(join(repo, "temp.txt"), "throwaway\n");

    await runGitAction(repo, { op: "stage", paths: ["README.md"] });
    const staged = await readGitWorkspaceStatus(repo);
    expect(staged.wip.staged).toBe(1);

    await runGitAction(repo, { op: "unstage", paths: ["README.md"] });
    const unstaged = await readGitWorkspaceStatus(repo);
    expect(unstaged.wip.staged).toBe(0);
    expect(unstaged.wip.unstaged).toBe(1);

    await runGitAction(repo, { op: "discard", paths: ["temp.txt"] });
    const afterDiscard = await readGitWorkspaceStatus(repo);
    expect(afterDiscard.files.some((f) => f.path === "temp.txt")).toBe(false);

    await runGitAction(repo, { op: "stash.push", message: "wip readme" });
    const snapStashed = await readGitSnapshot(repo, {});
    expect(snapStashed.stashes.length).toBe(1);
    expect(snapStashed.wip.unstaged).toBe(0);

    await runGitAction(repo, { op: "stash.pop", index: 0 });
    const snapPopped = await readGitSnapshot(repo, {});
    expect(snapPopped.stashes.length).toBe(0);
    expect(snapPopped.wip.unstaged).toBe(1);

    const reflog = await readGitReflog(repo, 10);
    expect(reflog.entries.length).toBeGreaterThanOrEqual(1);
    expect(reflog.entries[0]!.selector).toBe("HEAD@{0}");
  });

  test("detects merge conflicts and supports aborting cleanly", async () => {
    const repo = await createTempRepo();
    await runGitAction(repo, { op: "branch.create", name: "side", checkout: true });
    await writeFile(join(repo, "README.md"), "# Side branch\n");
    await runGitAction(repo, { op: "stage", all: true });
    await runGitAction(repo, { op: "commit", message: "Side edit" });

    await runGitAction(repo, { op: "checkout", ref: "main" });
    await writeFile(join(repo, "README.md"), "# Main branch\n");
    await runGitAction(repo, { op: "stage", all: true });
    await runGitAction(repo, { op: "commit", message: "Main edit" });

    const mergeResult = await runGitAction(repo, { op: "merge", ref: "side" });
    expect(mergeResult.ok).toBe(false);
    expect(mergeResult.conflicts?.operation).toBe("merge");
    expect(mergeResult.conflicts?.files).toContain("README.md");

    const aborted = await runGitAction(repo, { op: "conflict.abort" });
    expect(aborted.ok).toBe(true);

    const clean = await readGitSnapshot(repo, {});
    expect(clean.conflicts).toBeNull();
  });

  test("cleans up merged branches while protecting main and rejects unsafe inputs", async () => {
    const repo = await createTempRepo();
    await runGitAction(repo, { op: "branch.create", name: "merged-feat", checkout: false });

    const snapBefore = await readGitSnapshot(repo, {});
    const mergedBranch = snapBefore.branches.find((b) => b.name === "merged-feat");
    expect(mergedBranch?.merged).toBe(true);

    await runGitAction(repo, { op: "branches.cleanup", branches: ["merged-feat", "main"] });
    const snapAfter = await readGitSnapshot(repo, {});
    expect(snapAfter.branches.map((b) => b.name)).toEqual(["main"]);

    await expect(runGitAction(repo, { op: "checkout", ref: "--option-injection" })).rejects.toThrow(
      /Invalid ref/,
    );
    await expect(runGitAction(repo, { op: "discard", paths: ["../outside.txt"] })).rejects.toThrow(
      /outside repository/,
    );
  });

  test("blocks discarding .git metadata or paths escaping via symlinks", async () => {
    const repo = await createTempRepo();
    const outsideDir = await mkdtemp(join(tmpdir(), "aven-git-center-outside-"));
    cleanupDirs.push(outsideDir);
    const outsideFile = join(outsideDir, "keep.txt");
    await writeFile(outsideFile, "important\n");

    await symlink(outsideDir, join(repo, "escaped-dir"));
    await symlink(outsideFile, join(repo, "file-link"));
    await mkdir(join(repo, "nested"), { recursive: true });
    await writeFile(join(repo, "nested", "scratch.txt"), "remove me\n");

    await expect(runGitAction(repo, { op: "discard", paths: [".git"] })).rejects.toThrow(
      /\.git metadata/,
    );
    await expect(runGitAction(repo, { op: "discard", paths: [".git/HEAD"] })).rejects.toThrow(
      /\.git metadata/,
    );
    await expect(runGitAction(repo, { op: "discard", paths: [".GIT/config"] })).rejects.toThrow(
      /\.git metadata/,
    );
    await expect(
      runGitAction(repo, { op: "discard", paths: ["escaped-dir/keep.txt"] }),
    ).rejects.toThrow(/escapes repository via symlink/);

    expect((await lstat(join(repo, ".git", "HEAD"))).isFile()).toBe(true);
    expect(await readFile(outsideFile, "utf8")).toBe("important\n");

    await runGitAction(repo, { op: "discard", paths: ["file-link", "nested/scratch.txt"] });
    expect(await lstat(join(repo, "file-link")).catch(() => null)).toBeNull();
    expect(await lstat(join(repo, "nested", "scratch.txt")).catch(() => null)).toBeNull();
    expect(await readFile(outsideFile, "utf8")).toBe("important\n");
  });
});
