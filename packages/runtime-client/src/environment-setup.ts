import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { WORKSPACE_DIR } from "@aven/agents/sandbox-tools";
import type { ContainerBase, SetupInput } from "./types";

export const SETUP_SCRIPT = ".aven/setup";
export const RESUME_SCRIPT = ".aven/resume";

const SETUP_TIMEOUT_MS = 20 * 60_000;

export async function scriptState(root: string, script: string) {
  const found = await stat(join(root, script)).catch(() => null);
  if (!found?.isFile()) return "missing" as const;
  return found.mode & 0o111 ? ("ready" as const) : ("not-executable" as const);
}

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
    "--init",
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

export function setupRunArgs(input: SetupInput & { name: string }) {
  const args = containerBaseArgs(
    { ...input, label: `aven.setup=${input.key}` },
    { afterLimits: ["-v", `${input.root}:${WORKSPACE_DIR}`] },
  );
  args.push(input.baseImage, "sleep", "infinity");
  return args;
}

export function hostUser() {
  if (process.platform !== "linux" || !process.getuid || !process.getgid) return undefined;
  return `${process.getuid()}:${process.getgid()}`;
}

const SANDBOX_USER_TREES = ["/home/node", "/opt/venv", "/usr/local/rustup", "/usr/local/cargo"];

const SANDBOX_USER = "node";

const tail = (text: string, lines = 20) => text.trimEnd().split("\n").slice(-lines).join("\n");

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

    const handOver = (owner: string) =>
      docker(["exec", "-u", "0", name, "chown", "-R", owner, WORKSPACE_DIR]);
    if (input.hostUser) {
      const lent = await handOver(SANDBOX_USER);
      if (lent.code !== 0) {
        throw new Error(`Could not open the workspace to the setup: ${lent.stderr.trim()}`);
      }
    }

    const timeoutMs = input.timeoutMs ?? SETUP_TIMEOUT_MS;
    const ran = await docker(
      ["exec", "-w", WORKSPACE_DIR, "-e", "CI=true", name, `./${SETUP_SCRIPT}`],
      {
        timeoutMs,
      },
    );
    const handedBack = input.hostUser ? await handOver(input.hostUser) : undefined;
    await mkdir(dirname(input.logPath), { recursive: true });
    await writeFile(input.logPath, `${ran.stdout}${ran.stderr}`);
    if (ran.timedOut) {
      throw new Error(
        `${SETUP_SCRIPT} did not finish within ${Math.round(timeoutMs / 60_000)} minutes`,
      );
    }
    if (ran.code !== 0) {
      throw new Error(
        `${SETUP_SCRIPT} failed (exit ${ran.code}):\n${tail(`${ran.stdout}${ran.stderr}`)}`,
      );
    }

    if (input.hostUser) {
      if (handedBack && handedBack.code !== 0)
        throw new Error(`Could not hand the workspace back: ${handedBack.stderr.trim()}`);
      const opened = await docker([
        "exec",
        "-u",
        "0",
        name,
        "find",
        ...SANDBOX_USER_TREES,
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
      if (opened.code !== 0)
        throw new Error(`Could not open the environment to the host user: ${opened.stderr.trim()}`);
    }

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
