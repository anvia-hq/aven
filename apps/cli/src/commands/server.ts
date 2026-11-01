import { readFile } from "node:fs/promises";
import { join } from "node:path";

import compose from "../../../../deploy/docker-compose.yml" with { type: "text" };
import envTemplate from "../../../../deploy/env.example" with { type: "text" };
import { stringFlag, type Args } from "../args";
import { composeCommand, dockerProblem, run } from "../compose";
import { parseEnv } from "../env-file";
import { portIsFree, waitForHealthy } from "../health";
import { serverDir } from "../home";
import { writeServerFiles } from "../server-files";
import { version } from "../version";

const DEFAULT_PORT = 3000;

async function readServerEnv(dir: string) {
  const text = await readFile(join(dir, ".env"), "utf8").catch(() => undefined);
  if (text === undefined)
    throw new Error(`No server is installed in ${dir}. Run: aven server install`);
  return parseEnv(text);
}

const healthUrl = (env: Record<string, string>) =>
  `http://localhost:${env.AVEN_PORT || DEFAULT_PORT}/api/health`;

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
  const port = Number(stringFlag(args, "port") ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0) throw new Error("--port must be a port number");
  // A server that is already installed holds its port itself.
  if (!installed && !portIsFree(port))
    throw new Error(`Port ${port} is in use. Pick another with --port.`);

  const release = stringFlag(args, "release") ?? (version === "dev" ? "latest" : version);
  const origin = stringFlag(args, "origin") ?? `http://localhost:${port}`;
  await writeServerFiles(dir, { compose, envTemplate }, { origin, port, version: release });
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
