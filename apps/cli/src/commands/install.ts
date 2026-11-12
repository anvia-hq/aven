import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { stringFlag } from "../args";
import { exec } from "../compose";
import { parseEnv } from "../env-file";
import { serverDir } from "../home";
import { runnerInstall } from "./runner";
import { isExposed } from "../server-plan";
import { serverInstall } from "./server";
import { finish } from "./update";
import type { Args } from "../types";

export async function install(args: Args) {
  if (args.flags.runner) return runnerInstall(args);

  const installed = await readFile(join(serverDir(), ".env")).then(
    () => true,
    () => false,
  );

  if (installed) {
    console.log("Aven is already installed here; bringing it up to date.");
    return finish();
  }

  if (stringFlag(args, "owner-email") === undefined && process.stdin.isTTY) {
    const needed = isExposed({
      domain: stringFlag(args, "domain"),
      bind: stringFlag(args, "bind"),
    });
    const answer = prompt(
      needed
        ? "Your email, to be the platform owner (the only one who can register at first):"
        : "Your email, to be the platform owner who can close sign-ups (Enter to skip):",
    );

    if (answer?.trim()) args.flags["owner-email"] = answer.trim();
  }

  await serverInstall(args);

  const env = parseEnv(await readFile(join(serverDir(), ".env"), "utf8"));

  if (!args.flags["no-runner"] && env.AVEN_LOCAL_RUNNER === "host" && env.AVEN_LOCAL_RUNNER_TOKEN) {
    console.log("\nSetting up this machine as the server's runner...");
    const runnerArgs: Args = { positionals: [], flags: { ...args.flags } };
    runnerArgs.flags.url = `http://localhost:${env.AVEN_API_PORT}`;
    runnerArgs.flags.token = env.AVEN_LOCAL_RUNNER_TOKEN;
    await runnerInstall(runnerArgs);
  }

  console.log(
    `\nAven is ready: ${env.BETTER_AUTH_URL}\nCreate your account there, add an AI provider in Settings, and start a thread.`,
  );

  if (env.AVEN_BIND === "127.0.0.1")
    console.log(
      `Only this machine can open it. To let others in, set AVEN_BIND in ${join(serverDir(), ".env")} and run: aven restart\n` +
        "For a server on the internet install with --domain, which serves HTTPS.",
    );

  if (!args.flags["no-open"]) await openBrowser(env.BETTER_AUTH_URL ?? "");
}

async function openBrowser(url: string) {
  await exec([process.platform === "darwin" ? "open" : "xdg-open", url]);
}
