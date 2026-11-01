import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import compose from "../../../../deploy/docker-compose.yml" with { type: "text" };
import envTemplate from "../../../../deploy/env.example" with { type: "text" };
import { stringFlag, type Args } from "../args";
import { composeCommand, dockerProblem, run } from "../compose";
import { addMissingKeys, parseEnv, setEnv } from "../env-file";
import { portIsFree, waitForHealthy } from "../health";
import { serverDir } from "../home";
import { API_PORT, planServer } from "../server-plan";
import { writeServerFiles } from "../server-files";
import { version } from "../version";

async function readServerEnv(dir: string) {
  const text = await readFile(join(dir, ".env"), "utf8").catch(() => undefined);
  if (text === undefined)
    throw new Error(`No server is installed in ${dir}. Run: aven server install`);
  return parseEnv(text);
}

// The API's own port on this machine, which answers whatever the web entry point is set to.
const healthUrl = (env: Record<string, string>) =>
  `http://localhost:${env.AVEN_API_PORT || API_PORT}/health`;

async function runCompose(dir: string, args: string[]) {
  const code = await run(composeCommand(dir, args));
  if (code !== 0) throw new Error(`docker compose ${args[0]} failed (exit ${code})`);
}

/** Installs the server's files and starts it; run again it brings the files up to date and starts what is stopped. */
export async function serverInstall(args: Args) {
  const problem = await dockerProblem();
  if (problem) throw new Error(problem);

  const dir = serverDir();
  const installed = await readFile(join(dir, ".env"), "utf8").then(
    () => true,
    () => false,
  );
  const { options, needed, notes } = planServer(
    {
      port: stringFlag(args, "port"),
      httpsPort: stringFlag(args, "https-port"),
      apiPort: stringFlag(args, "api-port"),
      domain: stringFlag(args, "domain"),
      origin: stringFlag(args, "origin"),
      release: stringFlag(args, "release") ?? (version === "dev" ? "latest" : version),
      ownerEmail: stringFlag(args, "owner-email"),
    },
    // A server that is already installed holds its ports itself.
    installed ? () => true : portIsFree,
  );
  for (const note of notes) if (!installed) console.log(note);
  // A server that is already installed holds its ports itself.
  const taken = installed ? undefined : needed.find((port) => !portIsFree(port));
  if (taken !== undefined)
    throw new Error(
      `Port ${taken} is in use. Pick another with --port, --https-port or --api-port.`,
    );

  await writeServerFiles(dir, { compose, envTemplate }, options);
  await runCompose(dir, ["up", "-d"]);
  await waitUntilHealthy(dir);
  const env = await readServerEnv(dir);
  console.log(`\nAven is running at ${env.BETTER_AUTH_URL}`);
}

async function waitUntilHealthy(dir: string) {
  const env = await readServerEnv(dir);
  console.log("Waiting for the server to answer...");
  if (!(await waitForHealthy(healthUrl(env))))
    throw new Error(`The server did not answer at ${healthUrl(env)}. See: aven server logs`);
}

export async function serverStart() {
  const dir = serverDir();
  await readServerEnv(dir);
  await runCompose(dir, ["up", "-d"]);
  await waitUntilHealthy(dir);
}

/**
 * Starts what is stopped and applies changes to `.env` or the compose file, then restarts the server
 * and the web entry point: `up -d` leaves a container whose configuration did not change running,
 * so the server would keep what it read at its start (the GitHub App, for one) after a change made
 * in the database.
 */
export async function serverRestart() {
  const dir = serverDir();
  await readServerEnv(dir);
  await runCompose(dir, ["up", "-d"]);
  await runCompose(dir, ["restart", "server", "web"]);
  await waitUntilHealthy(dir);
}

/** Removes the containers and keeps the database's volume. */
export async function serverStop() {
  await runCompose(serverDir(), ["down"]);
}

export async function serverStatus() {
  const dir = serverDir();
  const env = await readServerEnv(dir);
  await run(composeCommand(dir, ["ps"]));
  const answers = await waitForHealthy(healthUrl(env), { timeoutMs: 0 });
  console.log(
    answers ? `\nThe server answers at ${env.BETTER_AUTH_URL}` : "\nThe server does not answer.",
  );
}

export async function serverLogs(service: string | undefined, follow: boolean) {
  const args = ["logs", "--tail", "200"];
  if (follow) args.push("-f");
  if (service) args.push(service);
  await run(composeCommand(serverDir(), args));
}

/**
 * Brings an installed server to a release: the compose file of this version of `aven`, new settings
 * added to `.env`, the release pinned, the images pulled and the stack started again. Returns false
 * when no server is installed here.
 */
export async function serverUpgrade(release: string) {
  const dir = serverDir();
  const envPath = join(dir, ".env");
  const existing = await readFile(envPath, "utf8").catch(() => undefined);
  if (existing === undefined) return false;

  await writeFile(join(dir, "docker-compose.yml"), compose);
  // The file keeps its owner-only mode when it is written again.
  await writeFile(
    envPath,
    setEnv(addMissingKeys(existing, envTemplate), { AVEN_VERSION: release }),
  );
  // A version's images never change, but `latest` does.
  if (release === "latest") await runCompose(dir, ["pull"]);
  await runCompose(dir, ["up", "-d"]);
  await waitUntilHealthy(dir);
  return true;
}
