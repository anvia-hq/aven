import { createHash } from "node:crypto";
import { join } from "node:path";

import type { SandboxRuntime } from "@anvia/sandbox";
import type { EnvironmentSetup } from "../types";

const SETUP_TIMEOUT_MS = 20 * 60_000;
const RESUME_TIMEOUT_MS = 120_000;
const OUTPUT_TAIL = 2_000;

const SETUP = ".aven/setup";
const RESUME = ".aven/resume";

const MINUTES = SETUP_TIMEOUT_MS / 60_000;

function tail(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("utf8").trim().slice(-OUTPUT_TAIL);
}

function combinedOutput(stdout: Uint8Array, stderr: Uint8Array) {
  return [tail(stdout), tail(stderr)].filter((text) => text.length > 0).join("\n");
}

export async function runEnvironmentSetup({
  runtime,
  root,
  signal,
}: {
  runtime: SandboxRuntime;
  root: string;
  signal?: AbortSignal;
}): Promise<EnvironmentSetup> {
  const content = await runtime
    .readFile({ path: join(root, ".aven", "setup"), abortSignal: signal })
    .catch(() => null);

  if (!content) throw new Error(`Write ${SETUP} first: there is nothing to set up`);

  const digest = createHash("sha256").update(content).digest("hex");
  const result = await runtime.exec({
    command: "sh",
    args: ["-c", `exec env -i HOME="$HOME" PATH="$PATH" CI=1 AVEN_CLOUD=1 bash ${SETUP}`],
    cwd: root,
    timeoutMs: SETUP_TIMEOUT_MS,
    abortSignal: signal,
  });
  const output = combinedOutput(result.stdout, result.stderr);

  if (result.status !== "exited")
    throw new Error(`${SETUP} did not finish within ${MINUTES} minutes`, { cause: output });

  if (result.exitCode !== 0)
    throw new Error(`${SETUP} exited with ${result.exitCode}${output ? `:\n${output}` : ""}`);

  return { digest, output };
}

export async function runEnvironmentResume({
  runtime,
  root,
  env,
}: {
  runtime: SandboxRuntime;
  root: string;
  env: Readonly<Record<string, string>>;
}) {
  const resume = await runtime.readFile({ path: join(root, ".aven", "resume") }).catch(() => null);

  if (!resume) return false;

  const result = await runtime.exec({
    command: "bash",
    args: [RESUME],
    cwd: root,
    env: { ...env, AVEN_CLOUD: "1" },
    timeoutMs: RESUME_TIMEOUT_MS,
  });

  if (result.status === "exited" && result.exitCode === 0) return true;

  const output = combinedOutput(result.stdout, result.stderr);
  const reason =
    result.status === "exited"
      ? `exited with ${result.exitCode}`
      : `did not finish within ${RESUME_TIMEOUT_MS / 1000}s`;
  console.warn(`${RESUME} ${reason}${output ? `:\n${output}` : ""}`);
  return false;
}
