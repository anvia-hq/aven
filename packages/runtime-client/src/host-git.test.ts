import { afterAll, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { git } from "./git-clone";
import { hostGit } from "./host-git";
import { markTurn, threadDiff } from "./thread-diff";
import { searchWorkspace } from "./workspace-files";

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));

// A workspace with one commit, and a script that leaves `ran` beside it when anything runs it.
async function workspace() {
  const base = await mkdtemp(join(tmpdir(), "aven-host-git-"));
  dirs.push(base);
  const root = join(base, "work");
  await mkdir(root);
  const sh = (...args: string[]) => git(args, { cwd: root });
  await sh("init", "-q", "-b", "main");
  await writeFile(join(root, "a.txt"), "one\n");
  await sh("add", ".");
  await sh("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "first");
  const marker = join(base, "ran");
  const script = join(base, "planted.sh");
  await writeFile(script, `#!/bin/sh\ntouch '${marker}'\ncat\n`);
  await chmod(script, 0o755);
  const ran = () => Bun.file(marker).exists();
  return { base, root, sh, script, ran, marker };
}

// What the agent can do from its container: write the workspace's git configuration and files.
describe("git the runner runs on a workspace", () => {
  test("does not run a clean filter the workspace's configuration names", async () => {
    const { root, sh, script, ran } = await workspace();
    await sh("config", "filter.x.clean", script);
    await writeFile(join(root, ".gitattributes"), "* filter=x\n");
    await writeFile(join(root, "a.txt"), "two\n");

    expect(await markTurn(root)).toBe(true);
    expect((await threadDiff(root, "all"))?.patch).toContain("+two");
    expect(await ran()).toBe(false);
  });

  test("does not run a filter named by the repository's own attributes file", async () => {
    const { root, sh, script, ran } = await workspace();
    await sh("config", "filter.x.clean", script);
    await mkdir(join(root, ".git", "info"), { recursive: true });
    await writeFile(join(root, ".git", "info", "attributes"), "* filter=x\n");
    await writeFile(join(root, "a.txt"), "two\n");

    expect(await markTurn(root)).toBe(true);
    expect(await ran()).toBe(false);
  });

  test("does not run a diff driver's textconv", async () => {
    const { root, sh, script, ran } = await workspace();
    await sh("config", "diff.x.textconv", script);
    await writeFile(join(root, ".gitattributes"), "* diff=x\n");
    await writeFile(join(root, "a.txt"), "two\n");

    expect((await threadDiff(root, "all"))?.patch).toContain("+two");
    expect(await ran()).toBe(false);
  });

  test("does not run a hook, a signing program or a file system monitor", async () => {
    const { root, sh, script, ran } = await workspace();
    await writeFile(
      join(root, ".git", "hooks", "reference-transaction"),
      await Bun.file(script).text(),
    );
    await chmod(join(root, ".git", "hooks", "reference-transaction"), 0o755);
    await sh("config", "commit.gpgSign", "true");
    await sh("config", "gpg.program", script);
    await sh("config", "core.fsmonitor", script);

    expect(await markTurn(root)).toBe(true);
    expect(await searchWorkspace(root, "a")).toEqual(["a.txt"]);
    expect(await ran()).toBe(false);
  });

  test("writes the turn's ref and a moved HEAD into the workspace's own .git", async () => {
    const { root, sh } = await workspace();
    expect(await markTurn(root)).toBe(true);
    expect((await sh("rev-parse", "--verify", "refs/aven/turn")).code).toBe(0);

    const moved = await hostGit()(["checkout", "-q", "-B", "aven/t1"], { cwd: root });
    expect(moved.code).toBe(0);
    expect((await sh("symbolic-ref", "--short", "HEAD")).stdout.trim()).toBe("aven/t1");
  });

  test("refuses a .git that is a link or sends git to another directory", async () => {
    const { root } = await workspace();
    const other = await workspace();
    await rm(join(root, ".git"), { recursive: true });
    await symlink(join(other.root, ".git"), join(root, ".git"));
    expect((await hostGit()(["status"], { cwd: root })).code).toBe(128);

    await writeFile(join(other.root, ".git", "commondir"), "..\n");
    expect((await hostGit()(["status"], { cwd: other.root })).code).toBe(128);
  });

  test("does not fetch a missing object from a remote the workspace names", async () => {
    const { base, root, sh } = await workspace();
    const source = join(base, "source.git");
    await git(["clone", "-q", "--bare", root, source], { cwd: base });
    const blob = (await sh("rev-parse", "HEAD:a.txt")).stdout.trim();
    await rm(join(root, ".git", "objects", blob.slice(0, 2), blob.slice(2)));
    await mkdir(join(root, ".git", "remotes"));
    await writeFile(join(root, ".git", "remotes", "elsewhere"), `URL: file://${source}\n`);
    await sh("config", "core.repositoryformatversion", "1");
    await sh("config", "extensions.partialClone", "elsewhere");
    // Plain git would fetch the object from where the workspace says.
    expect((await sh("cat-file", "-e", blob)).code).toBe(0);
    await rm(join(root, ".git", "objects", blob.slice(0, 2), blob.slice(2)), { force: true });
    await rm(join(root, ".git", "objects", "pack"), { recursive: true, force: true });

    expect((await hostGit()(["cat-file", "-e", blob], { cwd: root })).code).not.toBe(0);
  });

  test("does not run what a repository nested in the workspace configures", async () => {
    const { root, script, ran } = await workspace();
    const nested = join(root, "vendor");
    await mkdir(nested);
    const inNested = (...args: string[]) => git(args, { cwd: nested });
    await inNested("init", "-q");
    await writeFile(join(nested, "b.txt"), "b\n");
    await inNested("add", ".");
    await inNested("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "first");
    await inNested("config", "core.fsmonitor", script);
    await inNested("config", "filter.x.clean", script);
    await writeFile(join(nested, ".gitattributes"), "* filter=x\n");
    await writeFile(join(nested, "b.txt"), "changed\n");

    expect(await markTurn(root)).toBe(true);
    await threadDiff(root, "all");
    expect(await ran()).toBe(false);
  });

  test("refuses a HEAD that is a link or a pipe, and writes through neither", async () => {
    const { base, root } = await workspace();
    const elsewhere = join(base, "elsewhere-HEAD");
    await writeFile(elsewhere, "ref: refs/heads/main\n");
    await rm(join(root, ".git", "HEAD"));
    await symlink(elsewhere, join(root, ".git", "HEAD"));
    expect((await hostGit()(["checkout", "-q", "-B", "aven/t1"], { cwd: root })).code).toBe(128);
    expect(await readFile(elsewhere, "utf8")).toBe("ref: refs/heads/main\n");

    await rm(join(root, ".git", "HEAD"));
    await Bun.spawn(["mkfifo", join(root, ".git", "HEAD")]).exited;
    expect(await markTurn(root)).toBe(false);
  });

  test("refuses a folder of .git that links out of the workspace, so nothing is written there", async () => {
    const { base, root } = await workspace();
    const outside = join(base, "outside-refs");
    await rename(join(root, ".git", "refs"), outside);
    await symlink(outside, join(root, ".git", "refs"));

    expect(await markTurn(root)).toBe(false);
    expect(await Bun.file(join(outside, "aven", "turn")).exists()).toBe(false);
  });

  test("refuses a link deeper in .git where git writes, so nothing is written there", async () => {
    for (const inside of [join("refs", "aven"), join("logs", "refs"), join("objects", "ab")]) {
      const { base, root } = await workspace();
      const outside = join(base, "outside");
      await mkdir(outside);
      await rm(join(root, ".git", inside), { recursive: true, force: true });
      await symlink(outside, join(root, ".git", inside));

      expect(await markTurn(root)).toBe(false);
      expect(await readdir(outside)).toEqual([]);
    }
  });
});
