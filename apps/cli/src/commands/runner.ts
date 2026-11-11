import { startDetachedUpdate } from "../detached-update";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";

import { stringFlag } from "../args";
import { capture, run } from "../compose";
import { waitForHealthy } from "../health";
import { logsDir, runnerEnvFile } from "../home";
import { parseEnv } from "../env-file";
import { loadRunnerEnv, writeRunnerEnv } from "../runner-config";
import { selfCommand } from "../self";
import { serviceManager } from "../service-manager";
import { serviceUnitState } from "../service-unit";
import { version } from "../version";
import type { Args, ServiceDefinition } from "../types";

const names = { launchdLabel: "dev.anvia.aven-runner", systemdUnit: "aven-runner" };
const manager = () => serviceManager(names);
const logFile = () => join(logsDir(), "runner.log");

function serviceDefinition(): ServiceDefinition {
  const env: Record<string, string> = {
    HOME: process.env.HOME ?? "",
    PATH: process.env.PATH ?? "",
  };
  for (const key of ["AVEN_HOME", "DOCKER_HOST", "DOCKER_CONFIG"])
    if (process.env[key]) env[key] = process.env[key]!;
  return {
    label: names.launchdLabel,
    command: [...selfCommand(), "runner", "run"],
    env,
    logFile: logFile(),
  };
}

async function storedSettings() {
  const text = await readFile(runnerEnvFile(), "utf8").catch(() => undefined);
  if (text === undefined) return undefined;
  const env = parseEnv(text);
  if (!env.AVEN_URL || !env.AVEN_RUNTIME_TOKEN) return undefined;
  return { url: env.AVEN_URL, token: env.AVEN_RUNTIME_TOKEN, dirs: env.AVEN_DIRS };
}

function folders(value: string | undefined) {
  const dirs = (value ?? "")
    .split(delimiter)
    .map((dir) => dir.trim())
    .filter(Boolean)
    .map((dir) => resolve(dir));
  if (dirs.length === 0) return [homedir()];
  if (dirs.some((dir) => !isAbsolute(dir))) throw new Error("--dir needs absolute folders");
  return dirs;
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
  if (!token.startsWith("avrt_"))
    throw new Error(
      "--token is not a runner token (they start with avrt_). Create one in Settings > Runtimes.",
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
    names,
    execPath: process.execPath,
  });
  if (unit?.problem) console.log(`Rewriting the runner service: ${unit.problem}`);
  await manager().install(serviceDefinition());
  console.log(`The runner is installed as a service. Its log: ${logFile()}`);
  console.log(await outcome(logSize));
}

async function outcome(from: number) {
  for (let i = 0; i < 30; i++) {
    const log = await readFile(logFile(), "utf8").catch(() => "");
    const lines = log.slice(from).split("\n");
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
