import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listCommits, listFiles, readReadme } from "./folder-contents";

const made: string[] = [];

async function served() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "aven-contents-")));
  made.push(root);
  const project = join(root, "project");
  await mkdir(join(project, "src"), { recursive: true });
  await mkdir(join(project, ".git"));
  await writeFile(join(project, "package.json"), "{}");
  await writeFile(join(project, ".gitignore"), "x");
  await writeFile(join(project, "src", "main.ts"), "x");
  return { root, project };
}

afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("the files of a folder project", () => {
  test("lists folders before files, keeps dot files, hides .git", async () => {
    const { root, project } = await served();

    const { entries } = await listFiles([root], project);

    expect(entries).toEqual([
      { name: "src", path: "src", type: "directory" },
      { name: ".gitignore", path: ".gitignore", type: "file" },
      { name: "package.json", path: "package.json", type: "file" },
    ]);
  });

  test("lists a folder inside the project with paths from the project's root", async () => {
    const { root, project } = await served();

    const { entries } = await listFiles([root], project, "src");

    expect(entries).toEqual([{ name: "main.ts", path: "src/main.ts", type: "file" }]);
  });

  test("refuses a path that leaves the folder, also through a symlink", async () => {
    const { root, project } = await served();
    await symlink(tmpdir(), join(project, "out"));

    await expect(listFiles([root], project, "../")).rejects.toThrow("outside the folder");
    await expect(listFiles([root], project, "out")).rejects.toThrow("outside the folder");
  });

  test("refuses a folder the runner does not serve", async () => {
    const { project } = await served();

    await expect(listFiles([], project)).rejects.toThrow("does not serve");
  });

  test("reads the README at the project's root, whatever its case", async () => {
    const { root, project } = await served();
    await writeFile(join(project, "Readme.md"), "# Hello");

    const { readme } = await readReadme([root], project);

    expect(readme).toEqual({
      name: "Readme.md",
      path: "Readme.md",
      text: "# Hello",
      truncated: false,
    });
  });

  test("has no README when the folder has none", async () => {
    const { root, project } = await served();

    expect((await readReadme([root], project)).readme).toBeNull();
  });

  describe("its commits", () => {
    const git = (cwd: string, ...args: string[]) =>
      Bun.$`git -c user.name=Ana -c user.email=ana@example.com ${args}`.cwd(cwd).quiet();

    async function repo(commits: number) {
      const { root, project } = await served();
      await rm(join(project, ".git"), { recursive: true });
      await git(project, "init", "-q", "-b", "main");
      for (let index = 1; index <= commits; index += 1) {
        await writeFile(join(project, "count.txt"), String(index));
        await git(project, "add", ".");
        await git(project, "commit", "-qm", `commit ${index}`);
      }
      return { root, project };
    }

    test("lists the newest first, ten to a page, with the branch and tag on their commit", async () => {
      const { root, project } = await repo(12);
      await git(project, "tag", "v1");

      const first = await listCommits([root], project);
      const second = await listCommits([root], project, 2);

      expect(first.commits).toHaveLength(10);
      expect(first.hasMore).toBe(true);
      expect(first.commits[0]).toMatchObject({
        message: "commit 12",
        author: "Ana",
        authorAvatar: null,
        refs: ["main"],
        tags: ["v1"],
      });
      expect(first.commits[0]!.parents).toHaveLength(1);
      expect(second.commits.map((commit) => commit.message)).toEqual(["commit 2", "commit 1"]);
      expect(second.hasMore).toBe(false);
    });

    test("has none for a folder that is not a git repository or has no commits yet", async () => {
      const { root, project } = await served();
      expect(await listCommits([root], project)).toEqual({ commits: [], hasMore: false });
      await git(project, "init", "-q", "-b", "main").catch(() => undefined);
      expect(await listCommits([root], project)).toEqual({ commits: [], hasMore: false });
    });

    test("has none for a folder inside a repository that is not itself the repository's root", async () => {
      const { root, project } = await served();
      await rm(join(project, ".git"), { recursive: true });
      await git(project, "init", "-q", "-b", "main");
      await writeFile(join(project, "a.txt"), "a");
      await git(project, "add", ".");
      await git(project, "commit", "-qm", "parent");

      expect((await listCommits([root], project)).commits).toHaveLength(1);
      expect(await listCommits([root], join(project, "src"))).toEqual({
        commits: [],
        hasMore: false,
      });
    });

    test("refuses a folder the runner does not serve", async () => {
      const { project } = await served();

      await expect(listCommits([], project)).rejects.toThrow("does not serve");
    });
  });
});
