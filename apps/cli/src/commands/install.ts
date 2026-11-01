import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { stringFlag, type Args } from "../args";
import { exec } from "../compose";
import { parseEnv } from "../env-file";
import { serverDir } from "../home";
import { runnerInstall } from "./runner";
import { serverInstall } from "./server";

/**
 * Installs Aven on this machine. By default that is the server and a runner beside it, which is
 * everything one person needs; `--runner --url <address> --token <token>` makes the machine only a
 * runner of a server that is somewhere else; `--no-runner` installs only the server.
 */
export async function install(args: Args) {
  if (args.flags.runner) return runnerInstall(args);

  if (stringFlag(args, "owner-email") === undefined && process.stdin.isTTY) {
    const answer = prompt(
      "Your email, to be the platform owner who can close sign-ups (Enter to skip):",
    );
    if (answer?.trim()) args.flags["owner-email"] = answer.trim();
  }
  await serverInstall(args);

  const env = parseEnv(await readFile(join(serverDir(), ".env"), "utf8"));
  if (!args.flags["no-runner"] && env.AVEN_LOCAL_RUNNER === "host" && env.AVEN_LOCAL_RUNNER_TOKEN) {
    console.log("\nSetting up this machine as the server's runner...");
    // The runner is on the same machine, so it uses the local address, whatever address people open.
    const runnerArgs: Args = { positionals: [], flags: { ...args.flags } };
    runnerArgs.flags.url = `http://localhost:${env.AVEN_PORT}/api`;
    runnerArgs.flags.token = env.AVEN_LOCAL_RUNNER_TOKEN;
    await runnerInstall(runnerArgs);
  }

  console.log(
    `\nAven is ready: ${env.BETTER_AUTH_URL}\nCreate your account there, add an AI provider in Settings, and start a thread.`,
  );
  if (!args.flags["no-open"]) await openBrowser(env.BETTER_AUTH_URL ?? "");
}

// Best effort: a machine with no browser, or a person over ssh, just reads the address above.
async function openBrowser(url: string) {
  await exec([process.platform === "darwin" ? "open" : "xdg-open", url]);
}
