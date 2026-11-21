import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { RUNNER_TOKEN_PREFIX } from "@aven/protocol/runtimes";
import { servedFolders } from "@aven/runtime-client/run-runner";

import { stringFlag } from "../args";
import { startDetachedUpdate } from "../detached-update";
import { readEnvFile } from "../env-file";
import { waitForHealthy } from "../health";
import { logsDir, runnerEnvFile } from "../home";
import { capture, run } from "../process";
import { loadRunnerEnv, writeRunnerEnv } from "../runner-config";
import { selfCommand } from "../self";
import { serviceManager } from "../service-manager";
import { RUNNER_SERVICE_NAMES, serviceUnitState } from "../service-unit";
import { version } from "../version";
import type { Args, ServiceDefinition } from "../types";

const manager = () => serviceManager(RUNNER_SERVICE_NAMES);
const logFile = () => join(logsDir(), "runner.log");

function serviceDefinition(): ServiceDefinition {
  const env: Record<string, string> = {
    HOME: process.env.HOME ?? "",
    PATH: process.env.PATH ?? "",
  };
  for (const key of ["AVEN_HOME", "DOCKER_HOST", "DOCKER_CONFIG"])
    if (process.env[key]) env[key] = process.env[key]!;
  return {
    label: RUNNER_SERVICE_NAMES.launchdLabel,
    command: [...selfCommand(), "runner", "run"],
    env,
    logFile: logFile(),
  };
}

async function storedSettings() {
  const env = await readEnvFile(runnerEnvFile());

  if (!env || !env.AVEN_URL || !env.AVEN_RUNTIME_TOKEN) return undefined;

  return { url: env.AVEN_URL, token: env.AVEN_RUNTIME_TOKEN, dirs: env.AVEN_DIRS };
}

export function folders(value: string | undefined) {
  const raw = servedFolders(value);

  if (raw.length === 0) return [homedir()];

  if (raw.some((dir) => !isAbsolute(dir))) throw new Error("--dir needs absolute folders");

  return raw.map((dir) => resolve(dir));
}

export async function runnerInstall(args: Args) {
  const stored = await storedSettings();
  const url = stringFlag(args, "url") ?? stored?.url;
  const token = stringFlag(args, "token") ?? process.env.AVEN_RUNTIME_TOKEN ?? stored?.token;

  if (!url || !token)
    throw new Error(
      `Usage: aven runner install --url <control plane address> --token <token> [--dir <folder[:folder]>] (or AVEN_RUNTIME_TOKEN). The settings in ${runnerEnvFile()} are used when they are given nowhere.`,
    );

  if (!/^https?:\/\//.test(url)) throw new Error("--url must start with http:// or https://");

  if (!token.startsWith(RUNNER_TOKEN_PREFIX))
    throw new Error(
      `--token is not a runner token (they start with ${RUNNER_TOKEN_PREFIX}). Create one in Settings > Runtimes.`,
    );

  if ((await capture(["git", "--version"])) === undefined)
    throw new Error("git is not installed. A runner works on its folders with it.");

  const dirs = folders(stringFlag(args, "dir") ?? stored?.dirs);

  const base = url.replace(/\/$/, "");

  if (!(await waitForHealthy(`${base}/health`, { timeoutMs: 0 })))
    throw new Error(`Cannot reach the control plane at ${base}/health. Check the address.`);

  await writeRunnerEnv(runnerEnvFile(), { url: base, token, dirs });
  const logSize = (await stat(logFile()).catch(() => undefined))?.size ?? 0;
  const unit = await serviceUnitState({
    platform: process.platform,
    names: RUNNER_SERVICE_NAMES,
    execPath: process.execPath,
  });

  if (unit?.problem) console.log(`Rewriting the runner service: ${unit.problem}`);

  await manager().install(serviceDefinition());
  console.log(`The runner is installed as a service. Its log: ${logFile()}`);
  console.log(await outcome(logSize));
}

export function logSliceFrom(bytes: Buffer, from: number) {
  return bytes.subarray(from).toString("utf8");
}

async function outcome(from: number) {
  for (let i = 0; i < 30; i++) {
    const bytes = await readFile(logFile()).catch(() => Buffer.alloc(0));
    const lines = logSliceFrom(bytes, from).split("\n");
    const last = lines.findLast((line) =>
      /runtime connected|refused|not available|required/.test(line),
    );

    if (last) return last;

    await Bun.sleep(1000);
  }
  return "No word yet from the runner. See: aven runner logs";
}

export async function runnerRun() {
  const { runRunner } = await import("@aven/runtime-client/run-runner");
  await loadRunnerEnv(runnerEnvFile());
  const base = process.env.AVEN_URL;
  const token = process.env.AVEN_RUNTIME_TOKEN;

  if (!base || !token)
    throw new Error(
      `No runner is set up. Run: aven runner install --url <address> --token <token> (settings are read from ${runnerEnvFile()})`,
    );

  const release = version === "dev" ? undefined : version;
  await runRunner({
    base,
    token,
    build: release,
    update: release ? (to) => void startDetachedUpdate(to) : undefined,
  });
}

export async function runnerStart() {
  await manager().start();
}
export async function runnerStop() {
  await manager().stop();
}
export async function runnerRestart() {
  await manager().restart();
}
export async function runnerStatus() {
  console.log(`runner: ${await manager().status()}`);
  console.log(`settings: ${runnerEnvFile()}`);
  console.log(`log: ${logFile()}`);
}
export async function runnerLogs(follow: boolean) {
  const command = ["tail", "-n", "200"];

  if (follow) command.push("-f");

  await run([...command, logFile()]);
}
export async function runnerUninstall() {
  await manager().uninstall();
  console.log(
    `The runner service is removed. Its settings stay in ${runnerEnvFile()} and its threads' folders in the runtime home (AVEN_RUNTIME_HOME, ~/.aven/runtime by default).`,
  );
}

export async function runnerUpgrade() {
  const stored = await storedSettings();

  if (stored === undefined) return false;

  await writeRunnerEnv(runnerEnvFile(), {
    url: stored.url,
    token: stored.token,
    dirs: folders(stored.dirs),
  });
  await manager().install(serviceDefinition());
  return true;
}
