import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { homeRepairArgs } from "./container-home";
import { git } from "./git-clone";
import { containerBaseArgs } from "./environment-setup";
import { dockerRunArgs, runnerLabel, Sandboxes } from "./sandbox";
import { createRemoteRepo } from "./testing/remote-repo";
import type { ThreadSandbox } from "./types";

const fakeGit = async (args: string[], { cwd }: { cwd: string }) => {
  if (args[0] === "clone") await Bun.write(join(cwd, ".git", "HEAD"), "ref: refs/heads/main\n");
  return { code: 0, stdout: "", stderr: "" };
};
const access = { cloneUrl: "https://github.com/acme/web.git", defaultBranch: "main", token: "t" };
const repo = async () => access;

describe("dockerRunArgs", () => {
  const input = {
    name: "aven-sandbox-t1",
    threadId: "t1",
    image: "img:dev",
    root: "/data/t1",
    uploads: "/data/uploads/t1",
    skills: "/data/skills/threads/t1",
    host: "host.docker.internal",
    hubPort: 4321,
    token: "tok",
    runner: "r1",
    memoryMb: 1024,
    cpus: 1,
    pidsLimit: 64,
  };

  test("mounts the workspace, limits resources and points the daemon at the hub", () => {
    const args = dockerRunArgs(input);
    expect(args.slice(0, 4)).toEqual(["run", "-d", "--name", "aven-sandbox-t1"]);
    expect(args).toContain("/data/t1:/workspace");
    expect(args).toContain("/data/uploads/t1:/uploads:ro");
    expect(args).toContain("/data/skills/threads/t1:/skills:ro");
    expect(args).toContain("1024m");
    expect(args).toContain("aven.runner=r1");
    expect(args).toContain("ANVIA_CONTROL_URL=ws://host.docker.internal:4321/daemon");
    expect(args).toContain("ANVIA_SANDBOX_TOKEN=tok");
    expect(args.at(-1)).toBe("img:dev");
    expect(args).not.toContain("--user");
  });

  test("starts an init as PID 1 so abandoned children are reaped", () => {
    expect(dockerRunArgs(input)).toContain("--init");
  });

  test("passes the platform to docker when one is set", () => {
    expect(dockerRunArgs(input)).not.toContain("--platform");
    const args = dockerRunArgs({ ...input, platform: "linux/amd64" });
    expect(args.slice(-3)).toEqual(["--platform", "linux/amd64", "img:dev"]);
  });

  test("passes the runtime to docker when one is set", () => {
    expect(dockerRunArgs(input)).not.toContain("--runtime");
    const args = dockerRunArgs({ ...input, runtime: "runsc" });
    expect(args.slice(-3)).toEqual(["--runtime", "runsc", "img:dev"]);
  });

  test("runs as the host user when given one", () => {
    const args = dockerRunArgs({ ...input, user: "1000:1000" });
    expect(args.slice(-3)).toEqual(["--user", "1000:1000", "img:dev"]);
  });
});

describe("Sandboxes starting a container", () => {
  const fakeDocker = () => {
    const calls: string[][] = [];
    const docker = async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "", stderr: "" };
    };
    return { calls, docker };
  };

  test("removes its own containers and unlabelled ones when it starts, not another runner's", async () => {
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    const calls: string[][] = [];
    const docker = async (args: string[]) => {
      calls.push(args);
      const stdout =
        args[0] === "ps"
          ? `mine ${runnerLabel(home)}\nolder \ntheirs ${runnerLabel("/elsewhere")}\n`
          : "";
      return { code: 0, stdout, stderr: "" };
    };
    const sandboxes = await Sandboxes.start({ image: "img", home, docker, git: fakeGit });

    expect(calls.filter((args) => args[0] === "rm")).toEqual([["rm", "-f", "mine", "older"]]);
    await sandboxes.dispose();
  });

  test("two runs on a thread that has no clone yet clone it once", async () => {
    const { docker } = fakeDocker();
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    const clones: string[][] = [];
    const slowGit = async (args: string[], options: { cwd: string }) => {
      if (args[0] === "clone") clones.push(args);
      await Bun.sleep(100);
      return fakeGit(args, options);
    };
    const sandboxes = await Sandboxes.start({
      image: "img",
      home,
      docker,
      git: slowGit,
      connectTimeoutMs: 300,
    });

    const attempts = [1, 2].map(() =>
      sandboxes.acquire({ id: "t-clone" }, repo).catch(() => undefined),
    );
    await Promise.all(attempts);

    expect(clones).toHaveLength(1);
    await sandboxes.dispose();
  });

  describe("a sandbox acquired with no repository (a bot's computer, decision 0059)", () => {
    const acquireBotSandbox = async () => {
      const { calls, docker } = fakeDocker();
      const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
      const git = async (args: string[], options: { cwd: string }) => {
        if (args[0] === "clone") throw new Error("a bot's computer has no repository to clone");
        return fakeGit(args, options);
      };
      const sandboxes = await Sandboxes.start({
        image: "img",
        home,
        docker,
        git,
        connectTimeoutMs: 200,
      });
      const box = await sandboxes.acquire({ id: "bot-1" });
      const started = () => calls.filter((args) => args[0] === "run");
      return { box, calls, started, sandboxes, home };
    };

    test("is an empty workspace that is kept, clones nothing, and starts no container yet", async () => {
      const { started, sandboxes, home } = await acquireBotSandbox();

      expect(started()).toHaveLength(0);
      const dir = join(await realpath(home), "workspaces", "bot-1");
      expect((await stat(dir)).isDirectory()).toBe(true);
      expect(await sandboxes.workspace("bot-1")).toBeUndefined();
      await sandboxes.dispose();
      await rm(home, { recursive: true, force: true });
    });

    test("its container is started by `start`, once however many ask, and mounts that workspace", async () => {
      const { box, started, sandboxes, home } = await acquireBotSandbox();

      await Promise.allSettled([box.start?.(), box.start?.()]);

      expect(started()).toHaveLength(1);
      const mounted = started()[0]?.find((arg) => arg.endsWith(":/workspace"));
      expect(mounted).toBe(`${join(await realpath(home), "workspaces", "bot-1")}:/workspace`);
      await sandboxes.dispose();
      await rm(home, { recursive: true, force: true });
    });

    test("is started in the background when the bot has used its computer before (decision 0130)", async () => {
      const { calls, docker } = fakeDocker();
      const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
      await mkdir(join(home, "bot-computers"), { recursive: true });
      await writeFile(join(home, "bot-computers", "bot-1"), "");
      const sandboxes = await Sandboxes.start({
        image: "img",
        home,
        docker,
        git: fakeGit,
        connectTimeoutMs: 200,
      });

      await sandboxes.acquire({ id: "bot-1" });
      await sandboxes.acquire({ id: "bot-2" });
      await Bun.sleep(100);

      const started = calls.filter((args) => args[0] === "run");
      expect(started).toHaveLength(1);
      expect(started[0]?.some((arg) => arg.includes("bot-1"))).toBe(true);
      await sandboxes.dispose();
      await rm(home, { recursive: true, force: true });
    });

    test("and by the first tool that needs it, which is how a bot that only talks never starts one", async () => {
      const { box, started, sandboxes, home } = await acquireBotSandbox();
      const exec = box.tools.find((tool) => tool.name === "exec_command")!;

      await Promise.resolve(exec.call({ command: "ls" }, undefined as never)).catch(
        () => undefined,
      );

      expect(started()).toHaveLength(1);
      expect(await box.hasRunningProcesses()).toBe(false);
      expect(started()).toHaveLength(1);
      await sandboxes.dispose();
      await rm(home, { recursive: true, force: true });
    });
  });

  test("a second acquire while the container is starting waits for it and does not restart it", async () => {
    const { calls, docker } = fakeDocker();
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    const sandboxes = await Sandboxes.start({
      image: "img",
      home,
      docker,
      git: fakeGit,
      connectTimeoutMs: 400,
    });
    const thread = { id: "thread-1" };
    const first = sandboxes.acquire(thread, repo);
    await Bun.sleep(150);
    const second = sandboxes.acquire(thread, repo);
    const results = await Promise.allSettled([first, second]);

    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(String((results[0] as PromiseRejectedResult).reason)).toContain("did not connect");
    expect(calls.filter((args) => args[0] === "run")).toHaveLength(1);
    await sandboxes.dispose();
    await rm(home, { recursive: true, force: true });
  });

  test("dispose finishes even when a container will not be removed", async () => {
    const { docker: base } = fakeDocker();
    let started = false;
    const docker: typeof base = async (args) => {
      if (args[0] === "run") started = true;
      if (args[0] === "rm" && started) throw new Error("docker went away");
      return base(args);
    };
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    const sandboxes = await Sandboxes.start({
      image: "img",
      home,
      docker,
      git: fakeGit,
      connectTimeoutMs: 300,
    });
    const acquiring = sandboxes.acquire({ id: "t3" }, repo).catch(() => undefined);
    await Bun.sleep(100);
    const silenced = console.error;
    console.error = () => undefined;
    try {
      await expect(sandboxes.dispose()).resolves.toBeUndefined();
    } finally {
      console.error = silenced;
    }
    await acquiring;
    await rm(home, { recursive: true, force: true });
  });

  test("fails at once, saying why, when the container cannot reach the runner", async () => {
    const { calls, docker: base } = fakeDocker();
    const docker: typeof base = async (args) => {
      if (args[0] === "exec") return { code: 0, stdout: "blocked\n", stderr: "" };
      return base(args);
    };
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    const sandboxes = await Sandboxes.start({
      image: "img",
      home,
      docker,
      git: fakeGit,
      connectTimeoutMs: 5000,
      reachCheckAfterMs: 50,
    });
    const startedAt = Date.now();
    const failure = await sandboxes.acquire({ id: "t-fw" }, repo).catch((error: unknown) => error);

    expect(String(failure)).toContain("cannot reach the runner");
    expect(String(failure)).toContain("sudo ufw allow in on docker0");
    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(calls.some((args) => args[0] === "rm" && args.includes("aven-sandbox-t-fw"))).toBe(true);
    await sandboxes.dispose();
    await rm(home, { recursive: true, force: true });
  });

  test("keeps waiting for a daemon that is slow when the container does reach the runner", async () => {
    const { docker } = fakeDocker();
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    const sandboxes = await Sandboxes.start({
      image: "img",
      home,
      docker,
      git: fakeGit,
      connectTimeoutMs: 300,
      reachCheckAfterMs: 50,
    });
    const failure = await sandboxes
      .acquire({ id: "t-slow" }, repo)
      .catch((error: unknown) => error);

    expect(String(failure)).toContain("did not connect within");
    await sandboxes.dispose();
    await rm(home, { recursive: true, force: true });
  });

  test("gives up on a container whose daemon never connects and removes it", async () => {
    const { calls, docker } = fakeDocker();
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    const sandboxes = await Sandboxes.start({
      image: "img",
      home,
      docker,
      git: fakeGit,
      connectTimeoutMs: 100,
    });
    await expect(sandboxes.acquire({ id: "t2" }, repo)).rejects.toThrow("did not connect");
    expect(calls.at(-1)).toEqual(["rm", "-f", "aven-sandbox-t2"]);
    await sandboxes.dispose();
    await rm(home, { recursive: true, force: true });
  });
});

const verbOf = (args: string[]) => {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c") i++;
    else return args[i];
  }
};

describe("Sandboxes preparing a thread's environment (decision 0043)", () => {
  const org = "org-1";
  const sha = "sha256:base";

  function docker(fail: (args: string[]) => boolean = () => false) {
    const calls: string[][] = [];
    const run = async (args: string[]) => {
      calls.push(args);
      if (args[0] === "image") return { code: 0, stdout: `${sha}\n`, stderr: "" };
      if (fail(args)) return { code: 1, stdout: "", stderr: "boom" };
      return { code: 0, stdout: "", stderr: "" };
    };
    return { calls, run };
  }

  function git(options: { setup?: boolean; failRestore?: boolean } = {}) {
    const { setup = true, failRestore = false } = options;
    const calls: string[][] = [];
    const run = async (args: string[], { cwd }: { cwd: string }) => {
      calls.push(args);
      const verb = verbOf(args);
      if (verb === "clone") {
        await Bun.write(join(cwd, ".git", "HEAD"), "ref: refs/heads/main\n");
        if (setup) {
          await Bun.write(join(cwd, ".aven", "setup"), "#!/bin/sh\nexit 0\n");
          await chmod(join(cwd, ".aven", "setup"), 0o755);
        }
      }
      if (verb === "rev-parse") return { code: 0, stdout: "abc\n", stderr: "" };
      if (verb === "checkout" && args.includes("-f") && failRestore) {
        return { code: 1, stdout: "", stderr: "cannot update" };
      }
      return { code: 0, stdout: "", stderr: "" };
    };
    return { calls, run, verbs: () => calls.map(verbOf) };
  }

  async function start(fakeDocker: ReturnType<typeof docker>, fakeGit: ReturnType<typeof git>) {
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    const sandboxes = await Sandboxes.start({
      image: "img",
      home,
      docker: fakeDocker.run,
      git: fakeGit.run,
      connectTimeoutMs: 100,
    });
    const key = sandboxes.snapshots.keyFor(org, access.cloneUrl);
    const acquire = (id: string) =>
      sandboxes.acquire({ id, organizationId: org }, repo).catch(() => undefined);
    const cleanup = async () => {
      await sandboxes.dispose();
      await rm(home, { recursive: true, force: true });
    };
    return { sandboxes, key, acquire, cleanup, home };
  }

  const setupRuns = (calls: string[][]) => calls.filter((args) => args.includes("sleep"));
  const imageOfThread = (calls: string[][], threadId: string) =>
    calls.find((args) => args[0] === "run" && args.includes(`aven-sandbox-${threadId}`))?.at(-1);

  test("the first thread on a repository with a setup script sets up, snapshots and runs from the snapshot", async () => {
    const d = docker();
    const g = git();
    const { sandboxes, key, acquire, cleanup } = await start(d, g);

    await acquire("t-first");

    expect(setupRuns(d.calls)).toHaveLength(1);
    expect(d.calls.some((args) => args[0] === "exec" && args.includes("./.aven/setup"))).toBe(true);
    expect(d.calls.some((args) => args[0] === "commit" && args.at(-1) === `aven-env-${key}`)).toBe(
      true,
    );
    const snapshot = await sandboxes.snapshots.valid(key, sha);
    expect(snapshot?.image).toBe(`aven-env-${key}`);
    expect((await stat(join(snapshot!.workspace, ".aven", "setup"))).isFile()).toBe(true);
    expect(imageOfThread(d.calls, "t-first")).toBe(`aven-env-${key}`);
    await cleanup();
  });

  test("the next thread restores the snapshot, updates the repository and does not set up again", async () => {
    const d = docker();
    const g = git();
    const { sandboxes, key, acquire, cleanup, home } = await start(d, g);
    await acquire("t-first");
    const clones = g.verbs().filter((verb) => verb === "clone").length;

    await acquire("t-second");

    expect(g.verbs().filter((verb) => verb === "clone")).toHaveLength(clones);
    expect(setupRuns(d.calls)).toHaveLength(1);
    expect(g.calls.some((args) => verbOf(args) === "fetch")).toBe(true);
    const checkout = g.calls.find((args) => verbOf(args) === "checkout" && args.includes("-B"))!;
    expect(checkout.slice(checkout.indexOf("checkout"))).toEqual([
      "checkout",
      "-f",
      "-B",
      "aven/t-second",
      "origin/main",
    ]);
    expect(await Bun.file(join(home, "workspaces", "t-second", ".aven", "setup")).exists()).toBe(
      true,
    );
    expect(imageOfThread(d.calls, "t-second")).toBe(`aven-env-${key}`);
    expect(sandboxes.snapshots.imageFor(key)).toBe(`aven-env-${key}`);
    await cleanup();
  });

  test("a setup that fails makes no snapshot, does not fail the thread and runs the bare image", async () => {
    const d = docker((args) => args[0] === "exec" && args.includes("./.aven/setup"));
    const g = git();
    const silenced = console.warn;
    console.warn = () => undefined;
    const { sandboxes, key, acquire, cleanup } = await start(d, g);

    await acquire("t-broken");

    console.warn = silenced;
    expect(d.calls.some((args) => args[0] === "commit")).toBe(false);
    expect(await sandboxes.snapshots.valid(key, sha)).toBeNull();
    expect(imageOfThread(d.calls, "t-broken")).toBe("img");
    expect(d.calls.at(-1)?.[0]).toBe("rm");
    await cleanup();
  });

  test("a repository with no setup script is just cloned", async () => {
    const d = docker();
    const g = git({ setup: false });
    const { sandboxes, key, acquire, cleanup } = await start(d, g);

    await acquire("t-plain");

    expect(setupRuns(d.calls)).toHaveLength(0);
    expect(await sandboxes.snapshots.valid(key, sha)).toBeNull();
    expect(imageOfThread(d.calls, "t-plain")).toBe("img");
    await cleanup();
  });

  test("two threads starting together on a repository set it up once; the second restores", async () => {
    const d = docker();
    const g = git();
    const { acquire, cleanup } = await start(d, g);

    await Promise.all([acquire("t-one"), acquire("t-two")]);

    expect(setupRuns(d.calls)).toHaveLength(1);
    expect(g.verbs().filter((verb) => verb === "clone")).toHaveLength(1);
    await cleanup();
  });

  test("a snapshot that cannot be restored falls back to a clone and a new setup", async () => {
    const d = docker();
    const g = git({ failRestore: true });
    const silenced = console.warn;
    console.warn = () => undefined;
    const { acquire, cleanup } = await start(d, g);
    await acquire("t-first");

    await acquire("t-second");

    console.warn = silenced;
    expect(g.verbs().filter((verb) => verb === "clone")).toHaveLength(2);
    expect(setupRuns(d.calls)).toHaveLength(2);
    await cleanup();
  });

  describe("saving the environment on request", () => {
    async function threadWithScript(d: ReturnType<typeof docker>, mode: number | null = 0o755) {
      const g = git({ setup: false });
      const started = await start(d, g);
      await started.acquire("t-save");
      const root = (await started.sandboxes.workspace("t-save"))!;
      if (mode !== null) {
        await Bun.write(join(root, ".aven", "setup"), "#!/bin/sh\nexit 0\n");
        await chmod(join(root, ".aven", "setup"), mode);
      }
      return started;
    }
    const thread = { id: "t-save", organizationId: org };

    test("runs the script again, keeps the snapshot and points the thread at it", async () => {
      const d = docker();
      const { sandboxes, key, cleanup } = await threadWithScript(d);
      expect(await sandboxes.snapshots.valid(key, sha)).toBeNull();

      const saved = await sandboxes.saveEnvironment(thread, access);

      expect(saved).toEqual({ image: `aven-env-${key}` });
      expect((await sandboxes.snapshots.valid(key, sha))?.image).toBe(`aven-env-${key}`);
      expect(d.calls.some((args) => args[0] === "commit")).toBe(true);
      await sandboxes.release("t-save");
      d.calls.length = 0;
      await sandboxes.acquire({ id: "t-save", organizationId: org }, repo).catch(() => undefined);
      expect(imageOfThread(d.calls, "t-save")).toBe(`aven-env-${key}`);
      await cleanup();
    });

    test("says what to do when there is no script, or it cannot run", async () => {
      const none = await threadWithScript(docker(), null);
      await expect(none.sandboxes.saveEnvironment(thread, access)).rejects.toThrow(
        "has no .aven/setup: write one",
      );
      await none.cleanup();

      const locked = await threadWithScript(docker(), 0o644);
      await expect(locked.sandboxes.saveEnvironment(thread, access)).rejects.toThrow(
        "is not executable: run chmod +x",
      );
      await locked.cleanup();
    });

    test("a script that fails is the error, with its output, and nothing is kept", async () => {
      const d = docker((args) => args[0] === "exec" && args.includes("./.aven/setup"));
      const { sandboxes, key, cleanup } = await threadWithScript(d);

      await expect(sandboxes.saveEnvironment(thread, access)).rejects.toThrow(".aven/setup failed");

      expect(await sandboxes.snapshots.valid(key, sha)).toBeNull();
      expect(d.calls.some((args) => args[0] === "commit")).toBe(false);
      await cleanup();
    });

    test("a thread with no workspace has nothing to save", async () => {
      const { sandboxes, cleanup } = await start(docker(), git());

      await expect(
        sandboxes.saveEnvironment({ id: "t-none", organizationId: org }, access),
      ).rejects.toThrow("no workspace yet");
      await cleanup();
    });
  });

  test("a workspace keeps package stores out of git, new or already there", async () => {
    const d = docker();
    const g = git({ setup: false });
    const { sandboxes, acquire, cleanup, home } = await start(d, g);
    const exclude = () =>
      readFile(join(home, "workspaces", "t-store", ".git", "info", "exclude"), "utf8");

    await acquire("t-store");
    expect(await exclude()).toContain(".pnpm-store/");

    await Bun.write(join(home, "workspaces", "t-store", ".git", "info", "exclude"), "");
    await sandboxes.release("t-store");
    await acquire("t-store");
    expect(await exclude()).toContain(".pnpm-store/");
    await cleanup();
  });

  test("a thread keeps the image it started from when the snapshot is replaced", async () => {
    const d = docker();
    const g = git();
    const { sandboxes, key, acquire, cleanup } = await start(d, g);
    await acquire("t-first");
    await sandboxes.snapshots.remove(key);
    await sandboxes.release("t-first");

    await acquire("t-first");

    const runs = d.calls.filter(
      (args) => args[0] === "run" && args.includes("aven-sandbox-t-first"),
    );
    expect(runs.map((args) => args.at(-1))).toEqual([`aven-env-${key}`, `aven-env-${key}`]);
    await cleanup();
  });
});

const image = process.env.AVEN_SANDBOX_TEST_IMAGE;
const live = image ? describe : describe.skip;

live("a sandbox (real docker)", () => {
  let sandboxes: Sandboxes;
  let home: string;
  let threadId: string;
  let root: string;
  let box: ThreadSandbox;
  let remote: Awaited<ReturnType<typeof createRemoteRepo>>["access"];

  beforeAll(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), "aven-runner-home-")));
    sandboxes = await Sandboxes.start({ image: image!, home });
    remote = (await createRemoteRepo()).access;
    threadId = crypto.randomUUID();
    root = join(home, "workspaces", threadId);
    box = await sandboxes.acquire({ id: threadId }, async () => remote);
  }, 120_000);

  afterAll(async () => {
    await sandboxes.dispose();
    await rm(home, { recursive: true, force: true });
  });

  const call = async <Result = unknown>(from: ThreadSandbox, name: string, input: unknown) => {
    const tool = from.tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`No tool ${name}`);
    return (await tool.call(input as never)) as Result;
  };
  const run = (command: string, from = box) =>
    call<{ exitCode: number; stdout: string; stderr: string }>(from, "exec_command", { command });

  test("the agent gets every sandbox tool, our edit, and the desktop", () => {
    expect(box.tools.map((tool) => tool.name).sort()).toEqual(
      expect.arrayContaining([
        "exec_command",
        "read_file",
        "write_file",
        "list_files",
        "list_ports",
        "start_process",
        "list_processes",
        "read_process_logs",
        "stop_process",
        "wait_for_port",
        "edit",
        "desktop_screenshot",
      ]),
    );
  });

  test("commands run in the container, in the workspace mounted at /workspace", async () => {
    expect((await run("pwd")).stdout).toContain("/workspace");
    await run("echo from-the-container > made.txt");
    expect(await readFile(join(root, "made.txt"), "utf8")).toBe("from-the-container\n");
  }, 60_000);

  test("files are written, read and edited inside the container, and the host sees them", async () => {
    await call(box, "write_file", { path: "hello.txt", content: "hello world\n" });
    expect(await readFile(join(root, "hello.txt"), "utf8")).toBe("hello world\n");
    await call(box, "edit", { path: "hello.txt", oldString: "world", newString: "there" });
    const page = await call<{ content: string }>(box, "read_file", { path: "hello.txt" });
    expect(page.content).toBe("hello there\n");
    const listing = await call<{ entries: { path: string }[] }>(box, "list_files", {});
    expect(listing.entries.map((entry) => entry.path)).toContain("hello.txt");
  }, 60_000);

  test("a run's skills are in /skills, read-only, and their scripts run", async () => {
    const archive = await new Bun.Archive(
      {
        "SKILL.md": "---\nname: hello\ndescription: Says hello.\n---\nRun scripts/hi.sh.",
        "scripts/hi.sh": "#!/bin/sh\necho hello from a skill",
      },
      { compress: "gzip" },
    ).bytes();
    const skill = { name: "hello", description: "Says hello.", digest: "e".repeat(64) };
    await sandboxes.skills.install(threadId, [skill], async () => archive);

    expect((await run("/skills/hello/scripts/hi.sh")).stdout).toContain("hello from a skill");
    expect((await run("touch /skills/hello/x")).exitCode).not.toBe(0);
  }, 60_000);

  test("each thread gets its own clone of the repository under the runner's home", async () => {
    expect(root.startsWith(join(home, "workspaces"))).toBe(true);
    const other = await sandboxes.acquire({ id: crypto.randomUUID() }, async () => remote);
    expect((await run("ls -A", other)).stdout).toContain("README.md");
    await run("echo mine > private.txt");
    expect((await run("ls private.txt 2>&1", other)).stdout).toContain("No such file");
  }, 60_000);

  test("the thread's desktop streams VNC to a viewer, and only a running sandbox has one", async () => {
    expect(sandboxes.desktop(crypto.randomUUID())).toBeUndefined();
    const viewer = await sandboxes.desktop(threadId)!.openViewer();
    const first = await viewer.output[Symbol.asyncIterator]().next();
    expect(new TextDecoder().decode((first.value as Uint8Array).subarray(0, 11))).toBe(
      "RFB 003.008",
    );
    viewer.close();
  }, 90_000);

  test("a window manager keeps running on the desktop, so windows have title bars and can be moved", async () => {
    await sandboxes.desktop(threadId)!.start();
    const running = async () => (await run("pgrep -x xfwm4")).exitCode === 0;
    const deadline = Date.now() + 80_000;
    while (!(await running()) && Date.now() < deadline) await Bun.sleep(1_000);
    expect(await running()).toBe(true);
    await Bun.sleep(5_000);
    expect(await running()).toBe(true);
  }, 120_000);

  test("it is not the host: no host paths, and no credentials in the environment", async () => {
    expect((await run(`ls ${root} 2>&1`)).stdout).toContain("No such file");
    const env = (await run("env")).stdout;
    expect(env).not.toContain("ANVIA_SANDBOX_TOKEN");
    expect(env).not.toContain("ANVIA_CONTROL_URL");
  });

  test("exit codes and stderr come back", async () => {
    const result = await run("echo oops >&2; exit 7");
    expect(result.exitCode).toBe(7);
    expect(result.stderr).toContain("oops");
  });

  test("a process the agent starts keeps the sandbox busy until it is stopped", async () => {
    expect(await box.hasRunningProcesses()).toBe(false);
    const started = await call<{ id: string; status: string }>(box, "start_process", {
      command: "sleep 313",
    });
    expect(started.status).toBe("running");
    expect(await box.hasRunningProcesses()).toBe(true);
    const listed = await call<{ processes: unknown[] }>(box, "list_processes", {});
    expect(listed.processes).toHaveLength(1);

    const stopped = await call<{ status: string }>(box, "stop_process", { processId: started.id });
    expect(stopped.status).toBe("stopped");
    expect(await box.hasRunningProcesses()).toBe(false);
  }, 30_000);

  test("a command run in the background is a process a person can see and stop (decision 0071)", async () => {
    const answer = await call<string>(box, "exec_command", {
      command: "sleep 314",
      background: true,
    });
    expect(answer).toContain("Started in the background");

    const [listed] = await box.processes.list();
    expect(listed).toMatchObject({ command: "sleep 314", status: "running" });
    expect(await box.hasRunningProcesses()).toBe(true);

    const stopped = await box.processes.stop(listed!.id);
    expect(stopped.find((process) => process.id === listed!.id)?.status).toBe("stopped");
    expect(await box.hasRunningProcesses()).toBe(false);
  }, 30_000);

  test("the project's variables are in the environment of commands and processes, and a run without them has none (decision 0045)", async () => {
    sandboxes.setProjectEnv(threadId, [{ name: "DATABASE_URL", value: "postgres://in-container" }]);
    expect((await run("printenv DATABASE_URL")).stdout.trim()).toBe("postgres://in-container");

    await call(box, "start_process", {
      command: "sh",
      args: ["-c", "printenv DATABASE_URL > /workspace/from-process.txt"],
    });
    const written = join(root, "from-process.txt");
    let content = "";
    for (let tries = 0; tries < 100 && content === ""; tries++) {
      await Bun.sleep(100);
      content = await readFile(written, "utf8").catch(() => "");
    }
    expect(content).toBe("postgres://in-container\n");
    for (let tries = 0; tries < 100 && (await box.hasRunningProcesses()); tries++) {
      await Bun.sleep(100);
    }

    sandboxes.setProjectEnv(threadId, undefined);
    expect((await run("printenv DATABASE_URL")).exitCode).toBe(1);
  }, 60_000);
});

live("a bot's computer (real docker, decision 0059)", () => {
  let sandboxes: Sandboxes;
  let home: string;

  beforeAll(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), "aven-runner-home-")));
    sandboxes = await Sandboxes.start({ image: image!, home });
  }, 120_000);

  afterAll(async () => {
    await sandboxes.dispose();
    await rm(home, { recursive: true, force: true });
  });

  const exec = (box: ThreadSandbox, command: string) =>
    box.tools.find((tool) => tool.name === "exec_command")!.call({ command } as never) as Promise<{
      exitCode: number;
      stdout: string;
    }>;

  const running = async (id: string) =>
    (
      await new Response(
        Bun.spawn(["docker", "ps", "-q", "--filter", `name=aven-sandbox-${id}`]).stdout,
      ).text()
    ).trim() !== "";

  test("is off until a tool needs it, then runs commands in a workspace that is kept after it is freed", async () => {
    const id = crypto.randomUUID();
    const box = await sandboxes.acquire({ id });
    expect(await running(id)).toBe(false);

    await exec(box, "echo kept > note.txt");
    expect(await running(id)).toBe(true);
    expect((await exec(box, "pwd")).stdout).toContain("/workspace");

    await sandboxes.release(id);
    expect(await running(id)).toBe(false);
    const again = await sandboxes.acquire({ id });
    expect(await running(id)).toBe(false);
    expect((await exec(again, "cat note.txt")).stdout).toBe("kept\n");
    expect(await readFile(join(home, "workspaces", id, "note.txt"), "utf8")).toBe("kept\n");
  }, 300_000);

  test("a desktop call starts it too, and a bot's computer has no git repository", async () => {
    const id = crypto.randomUUID();
    const box = await sandboxes.acquire({ id });
    const screenshot = box.tools.find((tool) => tool.name === "desktop_screenshot")!;

    await Promise.resolve(screenshot.call({} as never));

    expect(await running(id)).toBe(true);
    expect((await exec(box, "git rev-parse --is-inside-work-tree 2>&1 || true")).stdout).toContain(
      "not a git repository",
    );
  }, 300_000);
});

describe("Sandboxes.start", () => {
  test("refuses a platform Docker does not know", async () => {
    const docker = async () => ({ code: 0, stdout: "", stderr: "" });
    await expect(
      Sandboxes.start({ image: "img", docker, git: fakeGit, platform: "windows/386" }),
    ).rejects.toThrow("use linux/amd64 or linux/arm64");
  });

  test("refuses a runtime the daemon has not registered, and says how to add gVisor", async () => {
    const docker = async (args: string[]) => ({
      code: 0,
      stdout: args[0] === "info" ? '{"runc":{"path":"runc"}}' : "",
      stderr: "",
    });
    await expect(
      Sandboxes.start({ image: "img", docker, git: fakeGit, runtime: "runsc" }),
    ).rejects.toThrow("runsc install");
    await expect(
      Sandboxes.start({ image: "img", docker, git: fakeGit, runtime: "--privileged" }),
    ).rejects.toThrow("not a Docker runtime name");
  });

  test("refuses to start when the image is missing, and says how to build it", async () => {
    const docker = async () => ({ code: 1, stdout: "", stderr: "No such image: nope" });
    await expect(Sandboxes.start({ image: "nope:latest", docker })).rejects.toThrow(
      "docker build -t nope:latest apps/runtime/sandbox-image",
    );
  });
});

live("a repository's environment (real docker)", () => {
  let sandboxes: Sandboxes;
  let home: string;
  let remote: Awaited<ReturnType<typeof createRemoteRepo>>;
  const organizationId = `org-${crypto.randomUUID().slice(0, 8)}`;

  const run = async (from: ThreadSandbox, command: string) => {
    const tool = from.tools.find((candidate) => candidate.name === "exec_command");
    const result = (await tool!.call({ command } as never)) as {
      exitCode: number;
      stdout: string;
    };
    return result;
  };

  beforeAll(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), "aven-runner-home-")));
    sandboxes = await Sandboxes.start({ image: image!, home });
    remote = await createRemoteRepo();
    await Bun.write(
      join(remote.dir, ".aven", "setup"),
      '#!/bin/sh\nset -e\necho "from setup" > "$HOME/marker.txt"\necho "built" > /workspace/built.txt\n',
    );
    await Bun.write(
      join(remote.dir, ".aven", "resume"),
      "#!/bin/sh\ndate +%s%N > /workspace/resumed.txt\n",
    );
    await chmod(join(remote.dir, ".aven", "setup"), 0o755);
    await chmod(join(remote.dir, ".aven", "resume"), 0o755);
    for (const args of [
      ["add", "."],
      ["commit", "-q", "-m", "add .aven"],
    ]) {
      await git(args, { cwd: remote.dir });
    }
  }, 120_000);

  afterAll(async () => {
    const key = sandboxes.snapshots.keyFor(organizationId, remote.access.cloneUrl);
    await sandboxes.dispose();
    await Bun.spawn(["docker", "rmi", "-f", `aven-env-${key}`]).exited;
    await rm(home, { recursive: true, force: true });
    await rm(remote.dir, { recursive: true, force: true });
  });

  test("the first thread sets the repository up; the next starts from that, with the repository brought up to date", async () => {
    const first = crypto.randomUUID();
    const firstBox = await sandboxes.acquire(
      { id: first, organizationId },
      async () => remote.access,
    );

    expect((await run(firstBox, "cat ~/marker.txt && cat /workspace/built.txt")).stdout).toBe(
      "from setup\nbuilt\n",
    );
    expect((await run(firstBox, "test -s /workspace/resumed.txt && echo yes")).stdout).toBe(
      "yes\n",
    );
    const key = sandboxes.snapshots.keyFor(organizationId, remote.access.cloneUrl);
    expect((await sandboxes.snapshots.valid(key, await imageId(image!)))?.image).toBe(
      `aven-env-${key}`,
    );

    await Bun.write(join(remote.dir, "NEWS.md"), "fresh\n");
    for (const args of [
      ["add", "."],
      ["commit", "-q", "-m", "news"],
    ])
      await git(args, { cwd: remote.dir });

    const second = crypto.randomUUID();
    const secondBox = await sandboxes.acquire(
      { id: second, organizationId },
      async () => remote.access,
    );

    expect((await run(secondBox, "cat ~/marker.txt && cat /workspace/built.txt")).stdout).toBe(
      "from setup\nbuilt\n",
    );
    expect((await run(secondBox, "cat /workspace/NEWS.md")).stdout).toBe("fresh\n");
    expect((await run(secondBox, "git rev-parse --abbrev-ref HEAD")).stdout.trim()).toBe(
      `aven/${second.slice(0, 8)}`,
    );
    expect((await run(secondBox, "test -s /workspace/resumed.txt && echo yes")).stdout).toBe(
      "yes\n",
    );
    await run(secondBox, "echo mine > /workspace/only-second.txt");
    expect((await run(firstBox, "test -e /workspace/only-second.txt; echo $?")).stdout.trim()).toBe(
      "1",
    );
  }, 300_000);
});

live("signing a sandbox in to GitHub (real docker)", () => {
  let sandboxes: Sandboxes;
  let home: string;
  let remote: Awaited<ReturnType<typeof createRemoteRepo>>;
  const ada = { token: "ghu_live-token", id: 42, login: "ada", name: "Ada L" };

  beforeAll(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), "aven-runner-home-")));
    sandboxes = await Sandboxes.start({ image: image!, home });
    remote = await createRemoteRepo();
  }, 120_000);

  afterAll(async () => {
    await sandboxes.dispose();
    await rm(home, { recursive: true, force: true });
    await rm(remote.dir, { recursive: true, force: true });
  });

  const run = async (from: ThreadSandbox, command: string) => {
    const tool = from.tools.find((candidate) => candidate.name === "exec_command");
    return (await tool!.call({ command } as never)) as {
      exitCode: number;
      stdout: string;
      stderr: string;
    };
  };

  test("gh and git act as the person after signing in, and as nobody after signing out", async () => {
    const id = crypto.randomUUID();
    const box = await sandboxes.acquire({ id }, async () => remote.access);

    await sandboxes.signInGithub(id, ada);

    expect((await run(box, "gh auth token")).stdout.trim()).toBe("ghu_live-token");
    const credential = await run(
      box,
      "printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill",
    );
    expect(credential.stdout).toContain("password=ghu_live-token");
    expect((await run(box, "git config --global user.email")).stdout.trim()).toBe(
      "42+ada@users.noreply.github.com",
    );
    expect((await run(box, "stat -c %a ~/.config/gh/hosts.yml")).stdout.trim()).toBe("600");
    expect((await run(box, "grep -rl ghu_live-token /workspace || true")).stdout).toBe("");

    await sandboxes.signInGithub(id, { token: "ghu_next", id: 7, login: "grace", name: null });
    expect((await run(box, "gh auth token")).stdout.trim()).toBe("ghu_next");
    expect((await run(box, "git config --global user.name")).stdout.trim()).toBe("grace");
    await sandboxes.signInGithub(id, undefined);
    expect((await run(box, "gh auth token")).exitCode).not.toBe(0);
    expect((await run(box, "git config --global user.email")).stdout.trim()).toBe("aven@localhost");
  }, 300_000);
});

live("a container started with the runner's arguments (real docker)", () => {
  const zombiesLeft = async (withInit: boolean) => {
    const name = `aven-zombie-${crypto.randomUUID().slice(0, 8)}`;
    const base = containerBaseArgs(
      {
        name,
        label: "aven.test=1",
        runner: "zombie-test",
        memoryMb: 256,
        cpus: 1,
        pidsLimit: 64,
      },
      { afterLimits: [] },
    ).filter((arg) => withInit || arg !== "--init");
    const script = "(true &); sleep 1; ps -eo stat | grep -c '^Z' || true";
    const docker = async (args: string[]) => {
      const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
      const stdout = await new Response(child.stdout).text();
      await child.exited;
      return stdout.trim();
    };
    try {
      await docker([...base, "--entrypoint", "sleep", image!, "60"]);
      return Number(await docker(["exec", name, "sh", "-c", script]));
    } finally {
      await docker(["rm", "-f", name]);
    }
  };

  test("leaves no zombies with an init, and does without one", async () => {
    expect(await zombiesLeft(false)).toBeGreaterThan(0);
    expect(await zombiesLeft(true)).toBe(0);
  }, 120_000);
});

live("the sandbox image for a user it has never heard of (real docker)", () => {
  const runAs = async (user: string | undefined, script: string) => {
    const asUser = user ? ["--user", user] : [];
    const args = ["docker", "run", "--rm", ...asUser, image!, "sh", "-c", script];
    const container = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([
      new Response(container.stdout).text(),
      new Response(container.stderr).text(),
    ]);
    return { code: await container.exited, stdout, stderr };
  };

  test("has a name, a home, a Python and a Rust environment, and git settings it can write", async () => {
    const out = await runAs(
      "4242:4242",
      [
        "echo whoami=$(id -un)",
        "echo userInfo=$(node -e \"console.log(require('os').userInfo().username)\")",
        'touch "$HOME/.probe" && echo home=ok',
        'mkdir -p "$ANVIA_SANDBOX_STATE_DIR/operations" && echo state=ok',
        "touch /opt/venv/.probe && echo venv=ok",
        "mkdir -p /usr/local/cargo/registry && echo cargo=ok",
        "touch /usr/local/rustup/.probe && echo rustup=ok",
        "git config --global user.name probe && echo git=$(git config --global user.name)",
        "gh --version | head -1 | cut -d' ' -f1",
      ].join("; "),
    );

    expect(out.stderr).not.toContain("Permission denied");
    expect(out.stdout.trim().split("\n")).toEqual([
      "whoami=aven",
      "userInfo=aven",
      "home=ok",
      "state=ok",
      "venv=ok",
      "cargo=ok",
      "rustup=ok",
      "git=probe",
      "gh",
    ]);
  }, 120_000);

  test("is repaired in a container made from an image that has not got the fix", async () => {
    const name = `aven-repair-${crypto.randomUUID().slice(0, 8)}`;
    const docker = async (args: string[]) => {
      const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { code: await child.exited, stdout: stdout.trim(), stderr };
    };
    try {
      await docker([
        "run",
        "-d",
        "--name",
        name,
        "--user",
        "4242:4242",
        "--entrypoint",
        "sleep",
        image!,
        "600",
      ]);
      await docker([
        "exec",
        "-u",
        "0",
        name,
        "sh",
        "-c",
        "chmod 0700 /home/node && chmod 0644 /etc/passwd /etc/group && chmod -R go-w /opt/venv /usr/local/cargo /usr/local/rustup",
      ]);
      const probe =
        "touch $HOME/.p && touch /opt/venv/.p && mkdir -p /usr/local/cargo/registry && echo $(id -un)";
      expect((await docker(["exec", name, "sh", "-c", probe])).code).not.toBe(0);

      const repaired = await docker(homeRepairArgs(name, "4242:4242"));
      expect(repaired.code).toBe(0);

      const after = await docker(["exec", name, "sh", "-c", probe]);
      expect(after.stdout).toBe("aven");
      expect((await docker(homeRepairArgs(name, "4242:4242"))).code).toBe(0);
      expect(
        (await docker(["exec", name, "sh", "-c", "grep -c '^aven:' /etc/passwd"])).stdout,
      ).toBe("1");
    } finally {
      await docker(["rm", "-f", name]);
    }
  }, 120_000);

  test("is still the image's own user when nobody names another", async () => {
    const out = await runAs(undefined, 'echo $(id -un) && touch "$HOME/.probe" && echo home=ok');

    expect(out.stdout.trim().split("\n")).toEqual(["node", "home=ok"]);
  }, 120_000);
});

async function imageId(name: string) {
  const out = await new Response(
    Bun.spawn(["docker", "image", "inspect", "--format", "{{.Id}}", name]).stdout,
  ).text();
  return out.trim();
}
