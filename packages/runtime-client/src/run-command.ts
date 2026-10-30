/** What a finished command left: its exit code and everything it wrote. */
export type CommandOutput = { code: number; stdout: string; stderr: string };

// Runs a command on this machine and collects its output. Without `env` it inherits this
// process's environment, as a spawn with none given does.
// With `timeoutMs`, a command still running after that long is stopped, and its stderr says so.
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
