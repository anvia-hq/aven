import { createHash } from "node:crypto";
import { join } from "node:path";

import type { SandboxRuntime } from "@anvia/sandbox";
import type { EnvironmentSetup } from "../types";

const SETUP_TIMEOUT_MS = 20 * 60_000;
const RESUME_TIMEOUT_MS = 10_000;
const OUTPUT_TAIL = 2_000;

const SETUP = ".aven/setup";

const MINUTES = SETUP_TIMEOUT_MS / 60_000;

function tail(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("utf8").trim().slice(-OUTPUT_TAIL);
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
    args: ["-c", `exec env -i HOME="$HOME" PATH="$PATH" CI=1 bash ${SETUP}`],
    cwd: root,
    timeoutMs: SETUP_TIMEOUT_MS,
    abortSignal: signal,
  });
  const stdout = tail(result.stdout);
  const stderr = tail(result.stderr);
  const output = [stdout, stderr].filter((text) => text.length > 0).join("\n");

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
    args: [".aven/resume"],
    cwd: root,
    env,
    timeoutMs: RESUME_TIMEOUT_MS,
  });

  return result.status === "exited" && result.exitCode === 0;
}
