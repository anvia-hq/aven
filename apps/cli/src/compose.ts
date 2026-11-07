import { join } from "node:path";

export const composeCommand = (dir: string, args: string[]) => [
  "docker",
  "compose",
  "--project-directory",
  dir,
  "-f",
  join(dir, "docker-compose.yml"),
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
