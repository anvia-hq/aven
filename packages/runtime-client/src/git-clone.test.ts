import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { threadBranch } from "@aven/protocol/thread-branch";

import { cloneRepository, git, isCloned } from "./git-clone";
import { createRemoteRepo } from "./testing/remote-repo";
import type { Git } from "./types";

const emptyDir = () => mkdtemp(join(tmpdir(), "aven-clone-"));

describe("cloneRepository", () => {
  test("clones the default branch and moves onto the thread's branch", async () => {
    const { access } = await createRemoteRepo();
    const dir = await emptyDir();
    const threadId = crypto.randomUUID();

    expect(await isCloned(dir)).toBe(false);
    await cloneRepository(dir, threadId, access);

    expect(await isCloned(dir)).toBe(true);
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe("# remote\n");
    const branch = await git(["branch", "--show-current"], { cwd: dir });
    expect(branch.stdout.trim()).toBe(threadBranch(threadId));
  });

  test("the token reaches git through its environment, not its arguments or .git/config", async () => {
    const { access } = await createRemoteRepo("s3cret-token");
    const dir = await emptyDir();
    const seen: { args: string[]; env: Record<string, string> }[] = [];
    const spy: Git = (args, options) => {
      seen.push({ args, env: options.env ?? {} });
      return git(args, options);
    };

    await cloneRepository(dir, "thread-1", access, spy);

    const clone = seen[0]!;
    expect(clone.args.join(" ")).not.toContain("s3cret-token");
    const header = Buffer.from("x-access-token:s3cret-token").toString("base64");
    expect(clone.env.GIT_CONFIG_VALUE_0).toContain(header);
    expect(await readFile(join(dir, ".git", "config"), "utf8")).not.toContain(header);
  });

  test("the header is limited to the clone URL's own origin, and the URL follows `--`", async () => {
    const dir = await emptyDir();
    const seen: { args: string[]; env: Record<string, string> }[] = [];
    const recording: Git = async (args, options) => {
      seen.push({ args, env: options.env ?? {} });
      return { code: 1, stdout: "", stderr: "stop" };
    };

    await cloneRepository(
      dir,
      "t",
      { cloneUrl: "https://github.com/acme/web.git", defaultBranch: "main", token: "tok" },
      recording,
    ).catch(() => undefined);

    expect(seen[0]!.env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraHeader");
    const args = seen[0]!.args;
    expect(args[args.indexOf("--") + 1]).toBe("https://github.com/acme/web.git");
  });

  test("a failed clone says why, hides the token and leaves the directory empty", async () => {
    const dir = await emptyDir();
    const failing: Git = async (_args, { cwd }) => {
      await Bun.write(join(cwd, "partial"), "x");
      return { code: 128, stdout: "", stderr: "fatal: bad credentials s3cret-token" };
    };

    const error = await cloneRepository(
      dir,
      "t",
      { cloneUrl: "https://github.com/acme/web.git", defaultBranch: "main", token: "s3cret-token" },
      failing,
    ).catch((caught: Error) => caught);

    expect((error as Error).message).toContain("Could not clone https://github.com/acme/web.git");
    expect((error as Error).message).not.toContain("s3cret-token");
    expect(await readdir(dir)).toEqual([]);
  });
});
