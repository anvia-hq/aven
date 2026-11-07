import type { CommandOutput } from "./types";

export async function runCommand(
  argv: string[],
  options: { cwd?: string; env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): Promise<CommandOutput> {
  const { cwd, env, timeoutMs } = options;
  const spawnOptions: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdout: "pipe";
    stderr: "pipe";
  } = { stdout: "pipe", stderr: "pipe" };
  if (cwd !== undefined) spawnOptions.cwd = cwd;
  if (env !== undefined) spawnOptions.env = env;
  const proc = Bun.spawn(argv, spawnOptions);
  let timedOut = false;
  const timer =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          proc.kill("SIGKILL");
        }, timeoutMs);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  if (!timedOut) return { code, stdout, stderr };
  return {
    code,
    stdout,
    stderr: `${stderr}\ntimed out after ${timeoutMs} ms`,
    timedOut: true,
  };
}
