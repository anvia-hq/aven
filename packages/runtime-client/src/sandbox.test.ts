import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dockerRunArgs, Sandboxes, type ThreadSandbox } from "./sandbox";
import { createRemoteRepo } from "./testing/remote-repo";

// Stands in for git where a test is about the container: a clone is just a `.git` directory.
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
    host: "host.docker.internal",
    hubPort: 4321,
    token: "tok",
    memoryMb: 1024,
    cpus: 1,
    pidsLimit: 64,
  };

  test("mounts the workspace, limits resources and points the daemon at the hub", () => {
    const args = dockerRunArgs(input);
    expect(args.slice(0, 4)).toEqual(["run", "-d", "--name", "aven-sandbox-t1"]);
    expect(args).toContain("/data/t1:/workspace");
    expect(args).toContain("1024m");
    expect(args).toContain("ANVIA_CONTROL_URL=ws://host.docker.internal:4321/daemon");
    expect(args).toContain("ANVIA_SANDBOX_TOKEN=tok");
    expect(args.at(-1)).toBe("img:dev");
    expect(args).not.toContain("--user");
  });

  test("passes the platform to docker when one is set", () => {
    expect(dockerRunArgs(input)).not.toContain("--platform");
    const args = dockerRunArgs({ ...input, platform: "linux/amd64" });
    expect(args.slice(-3)).toEqual(["--platform", "linux/amd64", "img:dev"]);
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

  test("a second acquire while the container is starting waits for it and does not restart it", async () => {
    const { calls, docker } = fakeDocker();
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    // No daemon ever dials in here, so both give up on the connect timeout.
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

// Needs Docker and a desktop sandbox image: AVEN_SANDBOX_TEST_IMAGE=aven-sandbox-desktop:dev
const image = process.env.AVEN_SANDBOX_TEST_IMAGE;
const live = image ? describe : describe.skip;

live("a sandbox (real docker)", () => {
  // Set up in beforeAll: a skipped describe still runs its body, which must not touch Docker.
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

  // Calls a tool the way the agent does, with the shape its result is expected to have.
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

  test("each thread gets its own clone of the repository under the runner's home", async () => {
    expect(root.startsWith(join(home, "workspaces"))).toBe(true);
    const other = await sandboxes.acquire({ id: crypto.randomUUID() }, async () => remote);
    expect((await run("ls -A", other)).stdout).toContain("README.md");
    await run("echo mine > private.txt");
    expect((await run("ls private.txt 2>&1", other)).stdout).toContain("No such file");
  }, 60_000);

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
});

describe("Sandboxes.start", () => {
  test("refuses a platform Docker does not know", async () => {
    const docker = async () => ({ code: 0, stdout: "", stderr: "" });
    await expect(
      Sandboxes.start({ image: "img", docker, git: fakeGit, platform: "windows/386" }),
    ).rejects.toThrow("use linux/amd64 or linux/arm64");
  });

  test("refuses to start when the image is missing, and says how to build it", async () => {
    const docker = async () => ({ code: 1, stdout: "", stderr: "No such image: nope" });
    await expect(Sandboxes.start({ image: "nope:latest", docker })).rejects.toThrow(
      "docker build -t nope:latest apps/runtime/sandbox-image",
    );
  });
});
