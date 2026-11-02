import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { WORKSPACE_DIR } from "@aven/agents/sandbox-tools";

import type { CommandOutput } from "./run-command";

/** Docker on the runner's machine; replaced in tests. A command may be stopped after `timeoutMs`. */
export type DockerRun = (
  args: string[],
  options?: { timeoutMs?: number },
) => Promise<CommandOutput>;

/** Where a repository keeps what sets up its environment, and what runs when a container starts (decision 0043). */
export const SETUP_SCRIPT = ".aven/setup";
export const RESUME_SCRIPT = ".aven/resume";

/** A setup that has not finished by then is stopped. */
const SETUP_TIMEOUT_MS = 20 * 60_000;

/** `missing` when the repository has no such script; `not-executable` when it has one that cannot run. */
export async function scriptState(root: string, script: string) {
  const found = await stat(join(root, script)).catch(() => null);
  if (!found?.isFile()) return "missing" as const;
  return found.mode & 0o111 ? ("ready" as const) : ("not-executable" as const);
}

export type SetupInput = {
  docker: DockerRun;
  /** A snapshot's key: names the setup container and the image made from it. */
  key: string;
  /** The image the setup container is made from: the sandbox image. */
  baseImage: string;
  /** The image the result is committed as. */
  image: string;
  /** The workspace on this machine, with the repository in it. */
  root: string;
  /** Where the output of the script is written. */
  logPath: string;
  /** The runner the container belongs to, as `runnerLabel` gives it. */
  runner: string;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  platform?: string;
  runtime?: string;
  /** `uid:gid` of the host user, when files must end up theirs (Linux); the setup runs as the image's user. */
  hostUser?: string;
  timeoutMs?: number;
};

export type ContainerBase = {
  name: string;
  /** What the container is for, as a label beside `aven.sandbox=1`, which every runner container has. */
  label: string;
  /** The runner the container belongs to, so a runner removes only its own (`runnerLabel`). */
  runner: string;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  /** Passed to `docker run --platform`; the host's own when not set. */
  platform?: string;
  /** Passed to `docker run --runtime`; the daemon's default when not set. */
  runtime?: string;
};

// The `docker run` arguments a runner's containers share, up to the image: `beforeLimits` and
// `afterLimits` are the container's own, in their place among them.
export function containerBaseArgs(
  input: ContainerBase,
  { beforeLimits = [], afterLimits }: { beforeLimits?: string[]; afterLimits: string[] },
) {
  const args = [
    "run",
    "-d",
    "--name",
    input.name,
    "--label",
    "aven.sandbox=1",
    "--label",
    `aven.runner=${input.runner}`,
    "--label",
    input.label,
    ...beforeLimits,
    "--memory",
    `${input.memoryMb}m`,
    "--cpus",
    String(input.cpus),
    "--pids-limit",
    String(input.pidsLimit),
    "--shm-size",
    "512m",
    ...afterLimits,
  ];
  if (input.platform) args.push("--platform", input.platform);
  if (input.runtime) args.push("--runtime", input.runtime);
  return args;
}

// A setup container is the sandbox image with a way to install system packages: no
// `no-new-privileges`, so `sudo` works. It only lives for the length of one setup and its commit.
export function setupRunArgs(input: SetupInput & { name: string }) {
  const args = containerBaseArgs(
    { ...input, label: `aven.setup=${input.key}` },
    { afterLimits: ["-v", `${input.root}:${WORKSPACE_DIR}`] },
  );
  args.push(input.baseImage, "sleep", "infinity");
  return args;
}

// On Linux a bind mount keeps host ownership, so files must be written as the host user.
export function hostUser() {
  if (process.platform !== "linux" || !process.getuid || !process.getgid) return undefined;
  return `${process.getuid()}:${process.getgid()}`;
}

// The folders of the image that any user of the container can write (decision 0095): the home, the
// Python environment and the Rust toolchain.
const SANDBOX_USER_TREES = ["/home/node", "/opt/venv", "/usr/local/rustup", "/usr/local/cargo"];

const tail = (text: string, lines = 20) => text.trimEnd().split("\n").slice(-lines).join("\n");

/**
 * Runs the repository's `.aven/setup` in a setup container and commits the container as
 * `input.image` (decision 0043). A script that fails, or runs too long, throws with the end of its
 * output, and nothing is committed; the container is removed either way.
 */
export async function setupEnvironment(input: SetupInput) {
  const { docker } = input;
  const name = `aven-setup-${input.key}`;
  await docker(["rm", "-f", name]);
  try {
    const inspected = await docker(["image", "inspect", "--format", "{{.Id}}", input.baseImage]);
    if (inspected.code !== 0)
      throw new Error(`The sandbox image ${input.baseImage} is not available`);
    const started = await docker(setupRunArgs({ ...input, name }));
    if (started.code !== 0) {
      throw new Error(
        `Could not start the setup container: ${started.stderr.trim() || started.stdout}`,
      );
    }

    const timeoutMs = input.timeoutMs ?? SETUP_TIMEOUT_MS;
    const ran = await docker(
      ["exec", "-w", WORKSPACE_DIR, "-e", "CI=true", name, `./${SETUP_SCRIPT}`],
      {
        timeoutMs,
      },
    );
    await mkdir(dirname(input.logPath), { recursive: true });
    await writeFile(input.logPath, `${ran.stdout}${ran.stderr}`);
    if (ran.stderr.includes("timed out after")) {
      throw new Error(
        `${SETUP_SCRIPT} did not finish within ${Math.round(timeoutMs / 60_000)} minutes`,
      );
    }
    if (ran.code !== 0) {
      throw new Error(
        `${SETUP_SCRIPT} failed (exit ${ran.code}):\n${tail(`${ran.stdout}${ran.stderr}`)}`,
      );
    }

    // What the script wrote should be the host user's to use, as the agent's files are: the
    // workspace is theirs, and the home and toolchain folders, which the script wrote as the image's
    // user, are writable by any user again (decision 0095).
    if (input.hostUser) {
      const owned = await docker([
        "exec",
        "-u",
        "0",
        name,
        "chown",
        "-R",
        input.hostUser,
        WORKSPACE_DIR,
      ]);
      if (owned.code !== 0)
        throw new Error(`Could not hand the workspace back: ${owned.stderr.trim()}`);
      const opened = await docker([
        "exec",
        "-u",
        "0",
        name,
        "chmod",
        "-R",
        "a+rwX",
        ...SANDBOX_USER_TREES,
      ]);
      if (opened.code !== 0)
        throw new Error(`Could not open the environment to the host user: ${opened.stderr.trim()}`);
    }

    // The container ran `sleep`; a thread's container must run the sandbox's daemon.
    const committed = await docker([
      "commit",
      "--change",
      'CMD ["anvia-sandbox-daemon"]',
      "--change",
      `WORKDIR ${WORKSPACE_DIR}`,
      name,
      input.image,
    ]);
    if (committed.code !== 0) {
      throw new Error(
        `Could not save the environment: ${committed.stderr.trim() || committed.stdout}`,
      );
    }
  } finally {
    await docker(["rm", "-f", name]).catch(() => undefined);
  }
}
