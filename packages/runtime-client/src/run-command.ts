/** What a finished command left: its exit code and everything it wrote. */
export type CommandOutput = { code: number; stdout: string; stderr: string };

// Runs a command on this machine and collects its output. Without `env` it inherits this
// process's environment, as a spawn with none given does.
export async function runCommand(
  argv: string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): Promise<CommandOutput> {
  const { cwd, env } = options;
  const spawnOptions: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdout: "pipe";
    stderr: "pipe";
  } = { stdout: "pipe", stderr: "pipe" };
  if (cwd !== undefined) spawnOptions.cwd = cwd;
  if (env !== undefined) spawnOptions.env = env;
  const proc = Bun.spawn(argv, spawnOptions);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}
