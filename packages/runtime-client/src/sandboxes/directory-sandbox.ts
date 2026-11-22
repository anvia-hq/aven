import { withoutRunnerSecrets } from "@aven/agent-backend/runner-secrets";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, join, posix } from "node:path";

import type {
  SandboxExecOptions,
  SandboxExecResult,
  SandboxFileEntry,
  SandboxPortStatus,
  SandboxProcessInfo,
  SandboxRuntime,
  SandboxWaitForPortOptions,
} from "@anvia/sandbox";

import type { Launch, Spawned, Terminate } from "../types";
import { validUtf8 } from "../processes/valid-utf8";

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

const MAX_PROCESS_LOG_BYTES = 1024 * 1024;
const MAX_EXEC_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_EXITED_PROCESSES = 50;

type LogBuffer = { chunks: Buffer[]; bytes: number; truncated: boolean };

async function collectBounded(stream: ReadableStream, limit: number) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;
  for await (const raw of stream) {
    const chunk = Buffer.from(raw);

    if (chunk.length === 0) continue;

    if (bytes >= limit) {
      truncated = true;
      continue;
    }

    const remaining = limit - bytes;

    if (chunk.length > remaining) {
      chunks.push(chunk.subarray(0, remaining));
      bytes = limit;
      truncated = true;
    } else {
      chunks.push(chunk);
      bytes += chunk.length;
    }
  }
  return { bytes: new Uint8Array(Buffer.concat(chunks)), truncated };
}

type Managed = {
  info: SandboxProcessInfo;
  proc: Spawned;
  stdout: LogBuffer;
  stderr: LogBuffer;
};

function createLogBuffer(): LogBuffer {
  return { chunks: [], bytes: 0, truncated: false };
}

function appendLog(buffer: LogBuffer, chunk: Buffer, limit: number) {
  if (chunk.length === 0) return;

  if (chunk.length >= limit) {
    buffer.chunks = [chunk.subarray(chunk.length - limit)];
    buffer.bytes = limit;
    buffer.truncated = true;
    return;
  }

  buffer.chunks.push(chunk);
  buffer.bytes += chunk.length;

  while (buffer.bytes > limit && buffer.chunks.length > 0) {
    const excess = buffer.bytes - limit;
    const head = buffer.chunks[0]!;

    if (head.length <= excess) {
      buffer.chunks.shift();
      buffer.bytes -= head.length;
    } else {
      buffer.chunks[0] = head.subarray(excess);
      buffer.bytes -= excess;
    }

    buffer.truncated = true;
  }
}

export class DirectorySandbox implements SandboxRuntime {
  readonly provider = "directory";
  readonly publishedPorts = [] as const;
  #processes = new Map<string, Managed>();
  #activeExecs = new Set<Spawned>();

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
    this.#activeExecs.add(proc);
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
        collectBounded(proc.stdout as ReadableStream, MAX_EXEC_OUTPUT_BYTES),
        collectBounded(proc.stderr as ReadableStream, MAX_EXEC_OUTPUT_BYTES),
        proc.exited,
      ]);
      const result = {
        stdout: stdout.bytes,
        stderr: stderr.bytes,
        durationMs: Date.now() - started,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
      };
      return timedOut
        ? { ...result, status: "timed_out" }
        : { ...result, status: "exited", exitCode };
    } finally {
      this.#activeExecs.delete(proc);
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
        throw new Error(`File not found: ${path}`, { cause: error });
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
    this.#pruneExited();
    const proc = this.#spawn(options);
    const id = `proc-${crypto.randomUUID().slice(0, 8)}`;
    const managed: Managed = {
      proc,
      stdout: createLogBuffer(),
      stderr: createLogBuffer(),
      info: {
        id,
        command: options.command,
        args: Array.from(options.args ?? []),
        status: "running",
        startedAt: new Date().toISOString(),
      },
    };
    this.#processes.set(id, managed);
    void collect(proc.stdout as ReadableStream, managed.stdout, MAX_PROCESS_LOG_BYTES);
    void collect(proc.stderr as ReadableStream, managed.stderr, MAX_PROCESS_LOG_BYTES);
    void proc.exited.then((exitCode) => {
      const status = managed.info.status === "running" ? "exited" : managed.info.status;
      managed.info = { ...managed.info, status, exitCode, endedAt: new Date().toISOString() };
      this.#pruneExited();
    });
    return managed.info;
  }

  #pruneExited() {
    let exited = 0;
    for (const managed of this.#processes.values()) {
      if (managed.info.status !== "running") exited++;
    }

    if (exited <= MAX_EXITED_PROCESSES) return;

    for (const [id, managed] of this.#processes) {
      if (exited <= MAX_EXITED_PROCESSES) break;

      if (managed.info.status === "running") continue;

      this.#processes.delete(id);
      exited--;
    }
  }

  async listProcesses() {
    return [...this.#processes.values()].map((managed) => managed.info);
  }

  async readProcessLogs({ processId, tailBytes }: { processId: string; tailBytes?: number }) {
    const managed = this.#get(processId);
    const tail = (buffer: LogBuffer) => {
      const bytes = new Uint8Array(Buffer.concat(buffer.chunks));
      const sliced =
        tailBytes === undefined ? bytes : bytes.slice(Math.max(0, bytes.length - tailBytes));
      return {
        bytes: validUtf8(sliced),
        truncated: buffer.truncated || (tailBytes !== undefined && bytes.length > tailBytes),
      };
    };
    const stdout = tail(managed.stdout);
    const stderr = tail(managed.stderr);
    return {
      stdout: stdout.bytes,
      stderr: stderr.bytes,
      stdoutTruncated: stdout.truncated,
      stderrTruncated: stderr.truncated,
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

  async waitForPort({
    containerPort,
    timeoutMs = 30_000,
    intervalMs = 100,
    abortSignal,
  }: SandboxWaitForPortOptions): Promise<SandboxPortStatus> {
    if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) {
      throw new Error(`Invalid port: ${containerPort}`);
    }

    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`Invalid timeoutMs: ${timeoutMs}`);
    }

    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
      throw new Error(`Invalid intervalMs: ${intervalMs}`);
    }

    const deadline = Date.now() + timeoutMs;

    while (true) {
      if (abortSignal?.aborted) {
        throw abortSignal.reason ?? new DOMException("Aborted", "AbortError");
      }

      const remaining = deadline - Date.now();

      if (remaining <= 0) {
        throw new Error(`Timed out waiting for port ${containerPort}`);
      }

      if (await canConnectPort(containerPort, Math.min(remaining, 1000), abortSignal)) {
        return {
          containerPort,
          protocol: "tcp",
          host: "127.0.0.1",
          hostPort: containerPort,
        };
      }

      const waitMs = Math.min(intervalMs, Math.max(0, deadline - Date.now()));

      if (waitMs <= 0) {
        throw new Error(`Timed out waiting for port ${containerPort}`);
      }

      await sleepWithAbort(waitMs, abortSignal);
    }
  }

  async dispose() {
    const active = [...[...this.#processes.values()].map(({ proc }) => proc), ...this.#activeExecs];
    await Promise.all(active.map((proc) => this.#kill(proc)));
    await Promise.all(active.map((proc) => proc.exited));
  }

  #get(processId: string) {
    const managed = this.#processes.get(processId);

    if (!managed) throw new Error(`Unknown process: ${processId}`);

    return managed;
  }
}

async function collect(stream: ReadableStream, into: LogBuffer, limit: number) {
  for await (const chunk of stream) appendLog(into, Buffer.from(chunk), limit);
}

function canConnectPort(port: number, timeoutMs: number, abortSignal?: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const socket = createConnection({ port, host: "localhost" });
    const done = (ok: boolean) => {
      if (settled) return;

      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
      socket.destroy();
      resolve(ok);
    };
    const onAbort = () => done(false);
    const timer = setTimeout(() => done(false), timeoutMs);

    abortSignal?.addEventListener("abort", onAbort, { once: true });
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function sleepWithAbort(ms: number, abortSignal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(abortSignal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(abortSignal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      abortSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}
