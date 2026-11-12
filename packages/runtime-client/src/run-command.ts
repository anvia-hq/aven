import type { CommandOutput } from "./types";

const PIPE_GRACE_MS = 500;
const CUT: unique symbol = Symbol("cut");

async function collect(stream: ReadableStream<Uint8Array>, stop: Promise<void>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  const cut: Promise<typeof CUT> = stop.then(() => CUT);
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), cut]);

      if (next === CUT || next.done) break;

      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

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
    detached: true;
  } = { stdout: "pipe", stderr: "pipe", detached: true };

  if (cwd !== undefined) spawnOptions.cwd = cwd;

  if (env !== undefined) spawnOptions.env = env;

  const proc = Bun.spawn(argv, spawnOptions);

  const stdoutStop = Promise.withResolvers<void>();
  const stderrStop = Promise.withResolvers<void>();
  const stopReading = () => {
    stdoutStop.resolve();
    stderrStop.resolve();
  };
  let timedOut = false;
  const timer =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          try {
            process.kill(-proc.pid, "SIGKILL");
          } catch {
            proc.kill("SIGKILL");
          }
        }, timeoutMs);
  const exited = proc.exited.then((code) => {
    clearTimeout(timer);
    setTimeout(stopReading, PIPE_GRACE_MS);
    return code;
  });

  const [stdout, stderr, code] = await Promise.all([
    collect(proc.stdout, stdoutStop.promise),
    collect(proc.stderr, stderrStop.promise),
    exited,
  ]);

  if (!timedOut) return { code, stdout, stderr };

  return {
    code,
    stdout,
    stderr: `${stderr}\ntimed out after ${timeoutMs} ms`,
    timedOut: true,
  };
}
