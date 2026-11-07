export type CommandOutput = { code: number; stdout: string; stderr: string };

export async function runCommand(
  argv: string[],
  options: { cwd?: string; env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): Promise<CommandOutput> {
  const { cwd, env, timeoutMs } = options;
  const spawnOptions: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    timeout?: number;
    stdout: "pipe";
    stderr: "pipe";
  } = { stdout: "pipe", stderr: "pipe" };
  if (cwd !== undefined) spawnOptions.cwd = cwd;
  if (env !== undefined) spawnOptions.env = env;
  if (timeoutMs !== undefined) spawnOptions.timeout = timeoutMs;
  const proc = Bun.spawn(argv, spawnOptions);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const timedOut = timeoutMs !== undefined && proc.signalCode !== null;
  return { code, stdout, stderr: timedOut ? `${stderr}\ntimed out after ${timeoutMs} ms` : stderr };
}
