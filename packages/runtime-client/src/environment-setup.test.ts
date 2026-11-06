import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setupEnvironment, setupRunArgs, scriptState, type DockerRun } from "./environment-setup";

const dirs: string[] = [];
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), "aven-setup-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

type Call = { args: string[]; timeoutMs?: number };

// A Docker that records what it was asked and answers from `answers`, by the first word of the command.
function fakeDocker(
  answers: Record<string, { code?: number; stdout?: string; stderr?: string }> = {},
) {
  const calls: Call[] = [];
  const docker: DockerRun = async (args, options) => {
    calls.push({ args, timeoutMs: options?.timeoutMs });
    const key = args[0] === "image" ? "inspect" : args[0]!;
    const answer = answers[key] ?? {};
    return { code: answer.code ?? 0, stdout: answer.stdout ?? "", stderr: answer.stderr ?? "" };
  };
  return {
    docker,
    calls,
    verbs: () => calls.map((call) => (call.args[0] === "image" ? "inspect" : call.args[0])),
  };
}

async function input(
  docker: DockerRun,
  over: Partial<Parameters<typeof setupEnvironment>[0]> = {},
) {
  const base = await temp();
  return {
    docker,
    key: "k1",
    baseImage: "aven-sandbox:dev",
    image: "aven-env-k1",
    root: join(base, "work"),
    logPath: join(base, "logs", "k1.setup.log"),
    runner: "r1",
    memoryMb: 4096,
    cpus: 2,
    pidsLimit: 512,
    ...over,
  };
}

describe("running a repository's setup", () => {
  test("starts a setup container, runs the script in it and commits it as the environment image", async () => {
    const fake = fakeDocker({
      inspect: { stdout: "sha256:base\n" },
      exec: { stdout: "installed\n" },
    });
    const given = await input(fake.docker);

    await setupEnvironment(given);

    expect(fake.verbs()).toEqual(["rm", "inspect", "run", "exec", "commit", "rm"]);
    const run = fake.calls[2]!.args;
    expect(run).toContain("aven-sandbox:dev");
    expect(run.slice(-2)).toEqual(["sleep", "infinity"]);
    expect(run).toContain(`${given.root}:/workspace`);
    expect(run).toContain("aven.setup=k1");
    // The point of a setup container: `sudo` must work, which `no-new-privileges` forbids.
    expect(run).not.toContain("no-new-privileges");
    expect(fake.calls[3]!.args).toEqual([
      "exec",
      "-w",
      "/workspace",
      "-e",
      "CI=true",
      "aven-setup-k1",
      "./.aven/setup",
    ]);
    expect(fake.calls[3]!.timeoutMs).toBe(20 * 60_000);
    expect(fake.calls[4]!.args).toEqual([
      "commit",
      "--change",
      'CMD ["anvia-sandbox-daemon"]',
      "--change",
      "WORKDIR /workspace",
      "aven-setup-k1",
      "aven-env-k1",
    ]);
    expect(await readFile(given.logPath, "utf8")).toBe("installed\n");
  });

  test("a script that fails says why, commits nothing and removes the container", async () => {
    const fake = fakeDocker({
      exec: { code: 2, stdout: "step 1\n", stderr: "E: unable to locate package nope\n" },
    });

    const error = await setupEnvironment(await input(fake.docker)).catch((thrown: Error) => thrown);

    expect((error as Error).message).toContain(".aven/setup failed (exit 2)");
    expect((error as Error).message).toContain("unable to locate package nope");
    expect(fake.verbs()).not.toContain("commit");
    expect(fake.verbs().at(-1)).toBe("rm");
  });

  test("a script that runs too long is stopped and says so", async () => {
    const fake = fakeDocker({ exec: { code: 143, stderr: "\ntimed out after 60000 ms" } });

    const error = await setupEnvironment(await input(fake.docker, { timeoutMs: 60_000 })).catch(
      (thrown: Error) => thrown,
    );

    expect((error as Error).message).toBe(".aven/setup did not finish within 1 minutes");
    expect(fake.calls.find((call) => call.args[0] === "exec")!.timeoutMs).toBe(60_000);
    expect(fake.verbs()).not.toContain("commit");
  });

  test("hands the workspace back to the host user when the script fails", async () => {
    const fake = fakeDocker();
    const docker: DockerRun = async (args, options) => {
      const result = await fake.docker(args, options);
      // Only the script fails; the ownership changes around it work.
      return args.at(-1) === "./.aven/setup"
        ? { ...result, code: 1, stderr: "mkdir failed" }
        : result;
    };

    const error = await setupEnvironment(await input(docker, { hostUser: "1234:1234" })).catch(
      (thrown: Error) => thrown,
    );

    expect((error as Error).message).toContain(".aven/setup failed (exit 1)");
    const last = fake.calls.filter((call) => call.args.includes("chown")).at(-1)!;
    expect(last.args).toContain("1234:1234");
  });

  test("lends the workspace to the image's user for the script and hands it to the host user after", async () => {
    const fake = fakeDocker();

    await setupEnvironment(await input(fake.docker, { hostUser: "1234:1234" }));

    const chowns = fake.calls.filter((call) => call.args.includes("chown"));
    expect(chowns.map((call) => call.args)).toEqual([
      ["exec", "-u", "0", "aven-setup-k1", "chown", "-R", "node", "/workspace"],
      ["exec", "-u", "0", "aven-setup-k1", "chown", "-R", "1234:1234", "/workspace"],
    ]);
    // The script runs between them, so it can write in the workspace.
    const order = fake.calls.map((call) =>
      call.args.includes("chown") ? `chown ${call.args[6]}` : call.args[0],
    );
    expect(order.slice(order.indexOf("chown node"), order.indexOf("chown 1234:1234") + 1)).toEqual([
      "chown node",
      "exec",
      "chown 1234:1234",
    ]);
    // What the script wrote in the home and the toolchains is writable by the host user as well.
    // Only the entries that are not already: touching them all would copy the toolchains into the
    // snapshot.
    expect(fake.calls.find((call) => call.args.includes("chmod"))!.args).toEqual([
      "exec",
      "-u",
      "0",
      "aven-setup-k1",
      "find",
      "/home/node",
      "/opt/venv",
      "/usr/local/rustup",
      "/usr/local/cargo",
      "(",
      "-type",
      "f",
      "-o",
      "-type",
      "d",
      ")",
      "!",
      "-perm",
      "-o=rw",
      "-exec",
      "chmod",
      "a+rwX",
      "{}",
      "+",
    ]);
    // Before the commit, so the snapshot's workspace copy is the host user's too.
    const lastExec = fake.verbs().lastIndexOf("exec");
    expect(lastExec).toBeLessThan(fake.verbs().indexOf("commit"));
  });

  test("a container that cannot start, or an image that is missing, is an error", async () => {
    const noStart = fakeDocker({ run: { code: 125, stderr: "no such image" } });
    await expect(setupEnvironment(await input(noStart.docker))).rejects.toThrow(
      "Could not start the setup container: no such image",
    );
    expect(noStart.verbs().at(-1)).toBe("rm");

    const noImage = fakeDocker({ inspect: { code: 1 } });
    await expect(setupEnvironment(await input(noImage.docker))).rejects.toThrow("is not available");
  });

  test("passes the platform and runtime the sandbox uses", async () => {
    const args = setupRunArgs({
      ...(await input(fakeDocker().docker, { platform: "linux/amd64", runtime: "runsc" })),
      name: "n",
    });

    expect(args).toContain("--platform");
    expect(args[args.indexOf("--platform") + 1]).toBe("linux/amd64");
    expect(args[args.indexOf("--runtime") + 1]).toBe("runsc");
  });
});

describe("a repository's setup script", () => {
  test("is missing, not executable, or ready", async () => {
    const root = await temp();
    expect(await scriptState(root, ".aven/setup")).toBe("missing");

    await mkdir(join(root, ".aven"));
    await writeFile(join(root, ".aven", "setup"), "#!/bin/sh\n");
    await chmod(join(root, ".aven", "setup"), 0o644);
    expect(await scriptState(root, ".aven/setup")).toBe("not-executable");

    await chmod(join(root, ".aven", "setup"), 0o755);
    expect(await scriptState(root, ".aven/setup")).toBe("ready");
  });
});
