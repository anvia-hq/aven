import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { parseEnv, setEnv } from "./env-file";

const LEGACY_PROJECT = "aven";
const PROJECT_HASH_LENGTH = 8;
const NAME_LINE = /^name:[ \t]*(.+?)[ \t]*$/m;

type ComposeProject = { Name: string; ConfigFiles: string };

const absolutePath = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};

const composeFile = (dir: string) => join(dir, "docker-compose.yml");

export const projectName = (home: string) =>
  `${LEGACY_PROJECT}-${createHash("sha256")
    .update(resolve(home))
    .digest("hex")
    .slice(0, PROJECT_HASH_LENGTH)}`;

function captured(command: string[]) {
  try {
    const child = Bun.spawnSync({ cmd: command, stdout: "pipe", stderr: "ignore" });
    return child.exitCode === 0 ? child.stdout.toString().trim() : undefined;
  } catch {
    return undefined;
  }
}

const isComposeProject = (value: unknown): value is ComposeProject =>
  typeof value === "object" &&
  value !== null &&
  "Name" in value &&
  "ConfigFiles" in value &&
  typeof value.Name === "string" &&
  typeof value.ConfigFiles === "string";

function composeProjects() {
  const listed = captured(["docker", "compose", "ls", "--all", "--format", "json"]);

  if (listed === undefined) return undefined;

  try {
    const parsed: unknown = JSON.parse(listed);
    return Array.isArray(parsed) ? parsed.filter(isComposeProject) : undefined;
  } catch {
    return undefined;
  }
}

const adoptedProject = (dir: string, projects: ComposeProject[] | undefined) => {
  const file = absolutePath(composeFile(dir));
  const here = (projects ?? []).filter((project) =>
    project.ConfigFiles.split(",").some((one) => absolutePath(one.trim()) === file),
  );
  return (here.find((project) => project.Name === LEGACY_PROJECT) ?? here[0])?.Name;
};

const declaredProject = (dir: string) => {
  let text: string | undefined;
  try {
    text = readFileSync(composeFile(dir), "utf8");
  } catch {
    return undefined;
  }
  const declared = NAME_LINE.exec(text)?.[1]
    ?.replace(/\s+#.*$/, "")
    .replace(/^["']|["']$/g, "");
  return declared === undefined || declared.includes("${") ? undefined : declared;
};

const envFile = (dir: string) => join(dir, ".env");

const recordedProject = (dir: string) => {
  try {
    return parseEnv(readFileSync(envFile(dir), "utf8")).COMPOSE_PROJECT_NAME || undefined;
  } catch {
    return undefined;
  }
};

export const composeProject = (dir: string, projects?: ComposeProject[]) =>
  recordedProject(dir) ??
  adoptedProject(dir, projects ?? composeProjects()) ??
  declaredProject(dir) ??
  (existsSync(envFile(dir)) ? LEGACY_PROJECT : projectName(dirname(resolve(dir))));

export function recordProject(dir: string, projects?: ComposeProject[]) {
  let text: string;
  try {
    text = readFileSync(envFile(dir), "utf8");
  } catch {
    return;
  }

  if (parseEnv(text).COMPOSE_PROJECT_NAME) return;

  writeFileSync(
    envFile(dir),
    setEnv(text, { COMPOSE_PROJECT_NAME: composeProject(dir, projects) }),
    {
      mode: 0o600,
    },
  );
}

export const composeCommand = (dir: string, args: string[]) => [
  "docker",
  "compose",
  "--project-name",
  composeProject(dir),
  "--project-directory",
  dir,
  "-f",
  composeFile(dir),
  ...args,
];

export async function run(command: string[], env?: Record<string, string>) {
  const child = Bun.spawn(command, {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, ...env },
  });
  return child.exited;
}

export async function capture(command: string[]) {
  try {
    const child = Bun.spawn(command, { stdout: "pipe", stderr: "ignore" });
    const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    return code === 0 ? out.trim() : undefined;
  } catch {
    return undefined;
  }
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

export async function exec(command: string[], env?: Record<string, string | undefined>) {
  try {
    const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe", env });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code, out: `${out}${err}`.trim() };
  } catch (error) {
    return { code: 127, out: error instanceof Error ? error.message : String(error) };
  }
}
