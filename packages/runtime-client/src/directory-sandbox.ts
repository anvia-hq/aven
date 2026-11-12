import { withoutRunnerSecrets } from "./runner-secrets";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import type {
  SandboxExecOptions,
  SandboxExecResult,
  SandboxFileEntry,
  SandboxProcessInfo,
  SandboxRuntime,
} from "@anvia/sandbox";

import type { Launch, Spawned, Terminate } from "./types";

const encoder = new TextEncoder();

export function killGroup(proc: Spawned) {
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    proc.kill("SIGKILL");
  }
}

export const localLaunch: Launch = ({ argv, cwd, env }) =>
  Bun.spawn(argv, {
    cwd,
    env: { ...withoutRunnerSecrets(process.env), ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });

const argvOf = ({ command, args }: { command: string; args?: readonly string[] }) =>
  args === undefined ? ["/bin/bash", "-c", command] : [command, ...args];

type Managed = { info: SandboxProcessInfo; proc: Spawned; stdout: Buffer[]; stderr: Buffer[] };

export class DirectorySandbox implements SandboxRuntime {
  readonly provider = "directory";
  readonly publishedPorts = [] as const;
  #processes = new Map<string, Managed>();

  constructor(
    readonly id: string,
    readonly root: string,
    readonly launch: Launch = localLaunch,
    readonly alias?: string,
    readonly terminate?: Terminate,
  ) {}

  #kill(proc: Spawned) {
    killGroup(proc);
    return this.terminate?.(proc) ?? Promise.resolve();
  }

  get workdir() {
    return this.alias ?? this.root;
  }

  #spawn(options: {
    command: string;
    args?: readonly string[];
    cwd?: string;
    env?: Readonly<Record<string, string>>;
  }) {
    const cwd = this.#path(options.cwd ?? ".");
    return this.launch({
      argv: argvOf(options),
      cwd,
      inside: posix.relative(this.root, cwd) || ".",
      env: options.env,
    });
  }

  #path(input: string) {
    const normalized = posix.normalize(input.replaceAll("\\", "/"));
    const relative = posix.isAbsolute(normalized)
      ? posix.relative(this.workdir, normalized) || "."
      : normalized;

    if (relative === ".." || relative.startsWith("../")) {
      throw new Error(`Sandbox path cannot leave the workspace: ${input}`);
    }

    return join(this.root, relative);
  }

  async exec(options: SandboxExecOptions): Promise<SandboxExecResult> {
    const started = Date.now();
    const proc = this.#spawn(options);
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          void this.#kill(proc);
        }, options.timeoutMs)
      : undefined;
    const abort = () => void this.#kill(proc);
    options.abortSignal?.addEventListener("abort", abort, { once: true });

    if (options.abortSignal?.aborted) abort();

    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout as ReadableStream).bytes(),
        new Response(proc.stderr as ReadableStream).bytes(),
        proc.exited,
      ]);
      const result = {
        stdout,
        stderr,
        durationMs: Date.now() - started,
        stdoutTruncated: false,
        stderrTruncated: false,
      };
      return timedOut
        ? { ...result, status: "timed_out" }
        : { ...result, status: "exited", exitCode };
    } finally {
      clearTimeout(timer);
      options.abortSignal?.removeEventListener("abort", abort);
    }
  }

  async *execStream(options: SandboxExecOptions) {
    yield { type: "result" as const, result: await this.exec(options) };
  }

  async readFile({ path }: { path: string }) {
    try {
      return new Uint8Array(await readFile(this.#path(path)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`File not found: ${path}`);
      }

      throw error;
    }
  }

  async readTextFile(options: { path: string }) {
    return new TextDecoder().decode(await this.readFile(options));
  }

  async readTextFilePage(options: { path: string; startLine?: number; lineCount?: number }) {
    const text = await this.readTextFile(options);
    const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    const startLine = options.startLine ?? 1;
    const page = lines.slice(startLine - 1, startLine - 1 + (options.lineCount ?? 500));
    const endLine = page.length > 0 ? startLine + page.length - 1 : null;
    const more = endLine !== null && endLine < lines.length;
    return {
      content: page.join(""),
      startLine,
      endLine,
      nextStartLine: more ? endLine + 1 : null,
      truncated: more,
      truncatedBy: more ? ("lines" as const) : null,
    };
  }

  async writeFile({ path, data }: { path: string; data: Uint8Array }) {
    const target = this.#path(path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async writeTextFile({ path, text }: { path: string; text: string }) {
    await this.writeFile({ path, data: encoder.encode(text) });
  }

  async listFiles(options: { path?: string } = {}): Promise<SandboxFileEntry[]> {
    const relative = options.path ?? ".";
    const entries = await readdir(this.#path(relative), { withFileTypes: true });
    return Promise.all(
      entries.map(async (entry) => {
        const path = posix.join(relative, entry.name);

        if (!entry.isFile()) return { path, type: entry.isDirectory() ? "directory" : "other" };

        return {
          path,
          type: "file",
          size: (await stat(join(this.#path(relative), entry.name))).size,
        };
      }),
    ) as Promise<SandboxFileEntry[]>;
  }

  async startProcess(options: {
    command: string;
    args?: readonly string[];
    cwd?: string;
    env?: Readonly<Record<string, string>>;
  }) {
    const proc = this.#spawn(options);
    const id = `proc-${crypto.randomUUID().slice(0, 8)}`;
    const managed: Managed = {
      proc,
      stdout: [],
      stderr: [],
      info: {
        id,
        command: options.command,
        args: Array.from(options.args ?? []),
        status: "running",
        startedAt: new Date().toISOString(),
      },
    };
    this.#processes.set(id, managed);
    void collect(proc.stdout as ReadableStream, managed.stdout);
    void collect(proc.stderr as ReadableStream, managed.stderr);
    void proc.exited.then((exitCode) => {
      const status = managed.info.status === "running" ? "exited" : managed.info.status;
      managed.info = { ...managed.info, status, exitCode, endedAt: new Date().toISOString() };
    });
    return managed.info;
  }

  async listProcesses() {
    return [...this.#processes.values()].map((managed) => managed.info);
  }

  async readProcessLogs({ processId, tailBytes }: { processId: string; tailBytes?: number }) {
    const managed = this.#get(processId);
    const tail = (chunks: Buffer[]) => {
      const bytes = new Uint8Array(Buffer.concat(chunks));
      return tailBytes === undefined ? bytes : bytes.slice(Math.max(0, bytes.length - tailBytes));
    };
    return {
      stdout: tail(managed.stdout),
      stderr: tail(managed.stderr),
      stdoutTruncated: false,
      stderrTruncated: false,
    };
  }

  async stopProcess({ processId }: { processId: string }) {
    const managed = this.#get(processId);

    if (managed.info.status === "running") {
      managed.info = { ...managed.info, status: "stopped" };
      await this.#kill(managed.proc);
      await managed.proc.exited;
    }

    return managed.info;
  }

  async waitForPort(): Promise<never> {
    throw new Error("waitForPort is not supported by the directory sandbox");
  }

  async dispose() {
    await Promise.all([...this.#processes.values()].map(({ proc }) => this.#kill(proc)));
    await Promise.all([...this.#processes.values()].map(({ proc }) => proc.exited));
  }

  #get(processId: string) {
    const managed = this.#processes.get(processId);

    if (!managed) throw new Error(`Unknown process: ${processId}`);

    return managed;
  }
}

async function collect(stream: ReadableStream, into: Buffer[]) {
  for await (const chunk of stream) into.push(Buffer.from(chunk));
}
