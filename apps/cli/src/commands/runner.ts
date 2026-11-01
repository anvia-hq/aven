import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { stringFlag, type Args } from "../args";
import { capture, dockerProblem, exec, run } from "../compose";
import { waitForHealthy } from "../health";
import { logsDir, runnerEnvFile } from "../home";
import { loadRunnerEnv, writeRunnerEnv } from "../runner-config";
import { selfCommand } from "../self";
import { serviceManager } from "../service-manager";
import { version } from "../version";

const names = { launchdLabel: "dev.anvia.aven-runner", systemdUnit: "aven-runner" };
const manager = () => serviceManager(names);
const logFile = () => join(logsDir(), "runner.log");

const imageFor = () => `ghcr.io/anvia-hq/aven-sandbox:${version === "dev" ? "latest" : version}`;

/** Installs this machine as a runner of a control plane and starts it as a service. */
export async function runnerInstall(args: Args) {
  const url = stringFlag(args, "url");
  // The token can come from the environment, so that it need not be on a command line.
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

  const image = stringFlag(args, "image") ?? imageFor();
  if ((await exec(["docker", "image", "inspect", image])).code !== 0) {
    console.log(`Pulling the sandbox image ${image} (several GB the first time)...`);
    if ((await run(["docker", "pull", image])) !== 0) throw new Error(`Could not pull ${image}`);
  }

  await writeRunnerEnv(runnerEnvFile(), { url: base, token, image });
  const env: Record<string, string> = {
    HOME: process.env.HOME ?? "",
    PATH: process.env.PATH ?? "",
  };
  // A service gets almost no environment of its own. It needs the person's PATH to find docker and git.
  for (const key of ["AVEN_HOME", "DOCKER_HOST", "DOCKER_CONFIG"])
    if (process.env[key]) env[key] = process.env[key]!;
  await manager().install({
    label: names.launchdLabel,
    command: [...selfCommand(), "runner", "run"],
    env,
    logFile: logFile(),
  });
  console.log(`The runner is installed as a service. Its log: ${logFile()}`);
  console.log(await outcome());
}

// What the runner said about connecting, for the first half minute.
async function outcome() {
  for (let i = 0; i < 30; i++) {
    const log = await readFile(logFile(), "utf8").catch(() => "");
    const lines = log.split("\n");
    const last = lines.findLast((line) =>
      /runtime connected|refused|not available|required/.test(line),
    );
    if (last) return last;
    await Bun.sleep(1000);
  }
  return "No word yet from the runner. See: aven runner logs";
}

/** The runner itself, in the foreground: what the service runs. */
export async function runnerRun() {
  const { runRunner } = await import("@aven/runtime-client/run-runner");
  await loadRunnerEnv(runnerEnvFile());
  const base = process.env.AVEN_URL;
  const token = process.env.AVEN_RUNTIME_TOKEN;
  if (!base || !token)
    throw new Error(
      `No runner is set up. Run: aven runner install --url <address> --token <token> (settings are read from ${runnerEnvFile()})`,
    );
  await runRunner({ base, token });
  // The runner keeps the process alive with its connection.
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
