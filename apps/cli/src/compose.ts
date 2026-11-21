import { createHash } from "node:crypto";
import { access, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { parseEnv, setEnv, writePrivateFile } from "./env-file";
import { capture, run } from "./process";

const LEGACY_PROJECT = "aven";
const PROJECT_HASH_LENGTH = 8;
const NAME_LINE = /^name:[ \t]*(.+?)[ \t]*$/m;

type ComposeProject = { Name: string; ConfigFiles: string };

const absolutePath = (path: string) => realpath(path).catch(() => resolve(path));

const composeFile = (dir: string) => join(dir, "docker-compose.yml");

export const projectName = (home: string) =>
  `${LEGACY_PROJECT}-${createHash("sha256")
    .update(resolve(home))
    .digest("hex")
    .slice(0, PROJECT_HASH_LENGTH)}`;

const isComposeProject = (value: unknown): value is ComposeProject =>
  typeof value === "object" &&
  value !== null &&
  "Name" in value &&
  "ConfigFiles" in value &&
  typeof value.Name === "string" &&
  typeof value.ConfigFiles === "string";

async function composeProjects() {
  const listed = await capture(["docker", "compose", "ls", "--all", "--format", "json"]);

  if (listed === undefined) return undefined;

  try {
    const parsed: unknown = JSON.parse(listed);
    return Array.isArray(parsed) ? parsed.filter(isComposeProject) : undefined;
  } catch {
    return undefined;
  }
}

async function adoptedProject(dir: string, projects: ComposeProject[] | undefined) {
  const file = await absolutePath(composeFile(dir));
  const matches = await Promise.all(
    (projects ?? []).map(async (project) => {
      const configs = await Promise.all(
        project.ConfigFiles.split(",").map((one) => absolutePath(one.trim())),
      );
      return configs.includes(file) ? project : undefined;
    }),
  );
  const here = matches.filter((project): project is ComposeProject => project !== undefined);
  return (here.find((project) => project.Name === LEGACY_PROJECT) ?? here[0])?.Name;
}

async function declaredProject(dir: string) {
  const text = await readFile(composeFile(dir), "utf8").catch(() => undefined);

  if (text === undefined) return undefined;

  const declared = NAME_LINE.exec(text)?.[1]
    ?.replace(/\s+#.*$/, "")
    .replace(/^["']|["']$/g, "");
  return declared === undefined || declared.includes("${") ? undefined : declared;
}

const envFile = (dir: string) => join(dir, ".env");

async function recordedProject(dir: string) {
  const text = await readFile(envFile(dir), "utf8").catch(() => undefined);
  return text === undefined ? undefined : parseEnv(text).COMPOSE_PROJECT_NAME || undefined;
}

const hasEnvFile = (dir: string) =>
  access(envFile(dir)).then(
    () => true,
    () => false,
  );

export async function composeProject(dir: string, projects?: ComposeProject[]) {
  return (
    (await recordedProject(dir)) ??
    (await adoptedProject(dir, projects ?? (await composeProjects()))) ??
    (await declaredProject(dir)) ??
    ((await hasEnvFile(dir)) ? LEGACY_PROJECT : projectName(dirname(resolve(dir))))
  );
}

export async function recordProject(dir: string, projects?: ComposeProject[]) {
  const text = await readFile(envFile(dir), "utf8").catch(() => undefined);

  if (text === undefined || parseEnv(text).COMPOSE_PROJECT_NAME) return;

  await writePrivateFile(
    envFile(dir),
    setEnv(text, { COMPOSE_PROJECT_NAME: await composeProject(dir, projects) }),
  );
}

export async function composeCommand(dir: string, args: string[], projects?: ComposeProject[]) {
  return [
    "docker",
    "compose",
    "--project-name",
    await composeProject(dir, projects),
    "--project-directory",
    dir,
    "-f",
    composeFile(dir),
    ...args,
  ];
}

export async function serverEnvKeys(dir: string) {
  const text = await readFile(envFile(dir), "utf8").catch(() => undefined);
  return text === undefined ? [] : Object.keys(parseEnv(text));
}

export async function runCompose(dir: string, args: string[]) {
  const [command, keys] = await Promise.all([composeCommand(dir, args), serverEnvKeys(dir)]);
  return run(command, undefined, keys);
}

export async function dockerProblem() {
  if ((await capture(["docker", "--version"])) === undefined)
    return "Docker is not installed. Install Docker Desktop, OrbStack or Docker Engine, then try again.";

  if ((await capture(["docker", "compose", "version"])) === undefined)
    return "Docker is installed without the compose plugin. Install Docker Compose v2.";

  if ((await capture(["docker", "info"])) === undefined)
    return "Docker is installed but not running. Start it, then try again.";

  return undefined;
}
