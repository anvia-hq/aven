import type { Env } from "./types";

export function without(env: Env, keys: readonly string[]) {
  const kept = { ...env };

  for (const key of keys) delete kept[key];

  return kept;
}

export function captured(command: string[]) {
  try {
    const child = Bun.spawnSync({ cmd: command, stdout: "pipe", stderr: "ignore" });
    return child.exitCode === 0 ? child.stdout.toString().trim() : undefined;
  } catch {
    return undefined;
  }
}

export async function run(
  command: string[],
  env?: Record<string, string>,
  drop: readonly string[] = [],
) {
  const child = Bun.spawn(command, {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...without(process.env, drop), ...env },
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

export async function exec(command: string[], env?: Env) {
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
