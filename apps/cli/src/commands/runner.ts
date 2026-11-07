import { startDetachedUpdate } from "../detached-update";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { stringFlag, type Args } from "../args";
import { capture, dockerProblem, exec, run } from "../compose";
import { waitForHealthy } from "../health";
import { logsDir, runnerEnvFile } from "../home";
import { parseEnv } from "../env-file";
import { loadRunnerEnv, writeRunnerEnv } from "../runner-config";
import { selfCommand } from "../self";
import type { ServiceDefinition } from "../service-files";
import { serviceManager } from "../service-manager";
import { version } from "../version";

const names = { launchdLabel: "dev.anvia.aven-runner", systemdUnit: "aven-runner" };
const manager = () => serviceManager(names);
const logFile = () => join(logsDir(), "runner.log");

const IMAGE_REPOSITORY = "ghcr.io/anvia-hq/aven-sandbox";
const imageFor = (release: string) => `${IMAGE_REPOSITORY}:${release}`;

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

export async function runnerInstall(args: Args) {
  const url = stringFlag(args, "url");
  const token = stringFlag(args, "token") ?? process.env.AVEN_RUNTIME_TOKEN;
  if (!url || !token)
    throw new Error(
      "Usage: aven runner install --url <control plane address> --token <token> (or AVEN_RUNTIME_TOKEN)",
    );
  if (!/^https?:\/\//.test(url)) throw new Error("--url must start with http:// or https://");
  if (!token.startsWith("avrt_"))
    throw new Error(
      "--token is not a runner token (they start with avrt_). Create one in Settings > Runtimes.",
    );

  const problem = await dockerProblem();
  if (problem) throw new Error(problem);
  if ((await capture(["git", "--version"])) === undefined)
    throw new Error("git is not installed. A runner clones each project's repository with it.");

  const base = url.replace(/\/$/, "");
  if (!(await waitForHealthy(`${base}/health`, { timeoutMs: 0 })))
    throw new Error(`Cannot reach the control plane at ${base}/health. Check the address.`);

  const image = stringFlag(args, "image") ?? imageFor(version === "dev" ? "latest" : version);
  if ((await exec(["docker", "image", "inspect", image])).code !== 0) {
    console.log(`Pulling the sandbox image ${image} (several GB the first time)...`);
    if ((await run(["docker", "pull", image])) !== 0) throw new Error(`Could not pull ${image}`);
  }

  await writeRunnerEnv(runnerEnvFile(), { url: base, token, image });
  const logSize = (await stat(logFile()).catch(() => undefined))?.size ?? 0;
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
    `The runner service is removed. Its settings stay in ${runnerEnvFile()} and its sandboxes' files in the runtime home (AVEN_RUNTIME_HOME, ~/.aven/runtime by default).`,
  );
}

export async function runnerUpgrade(release: string) {
  const text = await readFile(runnerEnvFile(), "utf8").catch(() => undefined);
  if (text === undefined) return false;
  const env = parseEnv(text);
  if (
    env.AVEN_URL &&
    env.AVEN_RUNTIME_TOKEN &&
    env.AVEN_SANDBOX_IMAGE?.startsWith(`${IMAGE_REPOSITORY}:`)
  ) {
    const image = imageFor(release);
    if ((await exec(["docker", "image", "inspect", image])).code !== 0) {
      console.log(`Pulling the sandbox image ${image}...`);
      if ((await run(["docker", "pull", image])) !== 0) throw new Error(`Could not pull ${image}`);
    }
    await writeRunnerEnv(runnerEnvFile(), {
      url: env.AVEN_URL,
      token: env.AVEN_RUNTIME_TOKEN,
      image,
    });
  }
  await manager().install(serviceDefinition());
  return true;
}
