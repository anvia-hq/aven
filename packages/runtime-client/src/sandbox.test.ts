import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JobRegistry } from "@aven/agents/jobs/job-registry";

import { containerPath, dockerRunArgs, Sandboxes } from "./sandbox";

describe("containerPath", () => {
  test("maps the project directory and what is under it to a path inside the workspace", () => {
    expect(containerPath("/home/me/app", "/home/me/app")).toBe(".");
    expect(containerPath("/home/me/app", "/home/me/app/src/lib")).toBe("src/lib");
  });

  test("refuses a path outside the project instead of running somewhere else", () => {
    expect(() => containerPath("/home/me/app", "/etc")).toThrow("outside the workspace");
    expect(() => containerPath("/home/me/app", "/home/me/app-other")).toThrow("outside");
  });
});

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

  test("a second acquire while the container is starting waits for it and does not restart it", async () => {
    const { calls, docker } = fakeDocker();
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    // No daemon ever dials in here, so both give up on the connect timeout.
    const sandboxes = await Sandboxes.start({ image: "img", home, docker, connectTimeoutMs: 400 });
    const thread = { id: "thread-1" };
    const first = sandboxes.acquire(thread);
    await Bun.sleep(150);
    const second = sandboxes.acquire(thread);
    const results = await Promise.allSettled([first, second]);

    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(String((results[0] as PromiseRejectedResult).reason)).toContain("did not connect");
    expect(calls.filter((args) => args[0] === "run")).toHaveLength(1);
    await sandboxes.dispose();
    await rm(home, { recursive: true, force: true });
  });

  test("gives up on a container whose daemon never connects and removes it", async () => {
    const { calls, docker } = fakeDocker();
    const home = await mkdtemp(join(tmpdir(), "aven-sandbox-home-"));
    const sandboxes = await Sandboxes.start({ image: "img", home, docker, connectTimeoutMs: 100 });
    await expect(sandboxes.acquire({ id: "t2" })).rejects.toThrow("did not connect");
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
  let root: string;
  let box: Awaited<ReturnType<Sandboxes["acquire"]>>;
  let jobs: JobRegistry;

  beforeAll(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), "aven-runner-home-")));
    sandboxes = await Sandboxes.start({ image: image!, home });
    box = await sandboxes.acquire({ id: crypto.randomUUID() });
    root = box.root;
    jobs = new JobRegistry({ launcher: box.launcher });
  }, 120_000);

  afterAll(async () => {
    await jobs.disposeAll();
    await sandboxes.dispose();
    await rm(home, { recursive: true, force: true });
  });

  const run = async (command: string, cwd = root) =>
    (await jobs.start({ command, cwd }).done).output;

  test("commands run in the container, in the project mounted at /workspace", async () => {
    expect(await run("pwd")).toContain("/workspace");
    await run("echo from-the-container > made.txt");
    expect(await readFile(join(root, "made.txt"), "utf8")).toBe("from-the-container\n");
  }, 60_000);

  test("each thread gets its own empty workspace under the runner's home", async () => {
    expect(root.startsWith(join(home, "workspaces"))).toBe(true);
    const other = await sandboxes.acquire({ id: crypto.randomUUID() });
    expect(other.root).not.toBe(root);
    const otherJobs = new JobRegistry({ launcher: other.launcher });
    const listing = (await otherJobs.start({ command: "ls -A", cwd: other.root }).done).output;
    expect(listing.trim()).toBe("");
    await run("echo mine > private.txt");
    expect(
      (await otherJobs.start({ command: "ls private.txt 2>&1", cwd: other.root }).done).output,
    ).toContain("No such file");
  }, 60_000);

  test("it is not the host: no host paths, and no credentials in the environment", async () => {
    expect(await run(`ls ${root}`)).toContain("No such file");
    expect(await run("env")).not.toContain("ANVIA_SANDBOX_TOKEN");
    expect(await run("env")).not.toContain("ANVIA_CONTROL_URL");
  });

  test("exit codes and stderr come back", async () => {
    const job = await jobs.start({ command: "echo oops >&2; exit 7", cwd: root }).done;
    expect(job.exitCode).toBe(7);
    expect(job.status).toBe("failed");
    expect(job.output).toContain("oops");
  });

  test("killing a background command stops it inside the container", async () => {
    const { id, done } = jobs.start({ command: "sleep 313", cwd: root, background: true });
    await Bun.sleep(500);
    expect(await run("pgrep -f 'sleep 313' | wc -l")).toMatch(/[12]/);
    await jobs.kill(id);
    expect((await done).status).toBe("killed");
    await Bun.sleep(500);
    expect((await run("pgrep -fc 'sleep 313' || true")).trim()).toMatch(/^[01]$/);
  }, 30_000);

  test("the agent gets desktop tools", () => {
    expect(box.tools.map((tool) => tool.name)).toContain("desktop_screenshot");
  });
});

describe("Sandboxes.start", () => {
  test("refuses to start when the image is missing, and says how to build it", async () => {
    const docker = async () => ({ code: 1, stdout: "", stderr: "No such image: nope" });
    await expect(Sandboxes.start({ image: "nope:latest", docker })).rejects.toThrow(
      "docker build -t nope:latest apps/runtime/sandbox-image",
    );
  });
});
