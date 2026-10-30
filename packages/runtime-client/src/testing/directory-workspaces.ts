import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";

import type {
  SandboxExecOptions,
  SandboxExecResult,
  SandboxFileEntry,
  SandboxProcessInfo,
  SandboxRuntime,
} from "@anvia/sandbox";

import { ArtifactStore } from "../artifacts";
import { SkillStore } from "../skills";
import { UploadStore } from "../uploads";
import type { ThreadSandbox, ThreadWorkspaces } from "../sandbox";
import { hasRunningProcesses, sandboxTools } from "../thread-tools";

const encoder = new TextEncoder();

type Spawned = ReturnType<typeof Bun.spawn>;

// Stops the command and what it spawned: commands run as process groups so `sleep` under `bash -c`
// does not outlive a kill.
function killGroup(proc: Spawned) {
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    proc.kill("SIGKILL");
  }
}

const spawn = (argv: string[], cwd: string, env?: Readonly<Record<string, string>>) =>
  Bun.spawn(argv, {
    cwd,
    env: { ...process.env, ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });

const argvOf = ({ command, args }: { command: string; args?: readonly string[] }) =>
  args === undefined ? ["/bin/bash", "-c", command] : [command, ...args];

type Managed = { info: SandboxProcessInfo; proc: Spawned; stdout: Buffer[]; stderr: Buffer[] };

// FOR TESTS ONLY: a `SandboxRuntime` over a temporary directory on this machine, with commands run
// directly and no container. A real runner always uses `Sandboxes`.
export class DirectorySandbox implements SandboxRuntime {
  readonly provider = "directory";
  readonly publishedPorts = [] as const;
  #processes = new Map<string, Managed>();

  constructor(
    readonly id: string,
    /** Absolute path of the workspace directory. */
    readonly workdir: string,
  ) {}

  // The real path of a workspace-relative path, or of an absolute path inside the workspace.
  #path(input: string) {
    const normalized = posix.normalize(input.replaceAll("\\", "/"));
    const relative = posix.isAbsolute(normalized)
      ? posix.relative(this.workdir, normalized) || "."
      : normalized;
    if (relative === ".." || relative.startsWith("../")) {
      throw new Error(`Sandbox path cannot leave the workspace: ${input}`);
    }
    return join(this.workdir, relative);
  }

  async exec(options: SandboxExecOptions): Promise<SandboxExecResult> {
    const started = Date.now();
    const proc = spawn(argvOf(options), this.#path(options.cwd ?? "."), options.env);
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killGroup(proc);
        }, options.timeoutMs)
      : undefined;
    const abort = () => killGroup(proc);
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
    // Lines keep their terminators, as the sandbox's pages do.
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
    const proc = spawn(argvOf(options), this.#path(options.cwd ?? "."), options.env);
    const id = `proc-${this.#processes.size + 1}`;
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
      killGroup(managed.proc);
      await managed.proc.exited;
    }
    return managed.info;
  }

  async waitForPort(): Promise<never> {
    throw new Error("waitForPort is not supported by the directory sandbox");
  }

  // Ends every process still running, as removing a real container would.
  async dispose() {
    for (const { proc } of this.#processes.values()) killGroup(proc);
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

// FOR TESTS ONLY: gives each thread a temporary directory and a sandbox over it. The agent gets the
// same tools as in a container.
export function directoryWorkspaces(
  /** Puts files in a new workspace before the first run. */
  seed?: (root: string) => Promise<void>,
): ThreadWorkspaces & {
  roots: Map<string, string>;
  sandboxes: Map<string, DirectorySandbox>;
  artifacts: ArtifactStore;
  uploads: UploadStore;
  skills: SkillStore;
} {
  const roots = new Map<string, string>();
  const sandboxes = new Map<string, DirectorySandbox>();
  const artifacts = new ArtifactStore(
    join(tmpdir(), `aven-directory-artifacts-${crypto.randomUUID()}`),
  );
  // There is no container to mount them in: the files are only kept.
  const uploads = new UploadStore(join(tmpdir(), `aven-directory-uploads-${crypto.randomUUID()}`));
  const skills = new SkillStore(join(tmpdir(), `aven-directory-skills-${crypto.randomUUID()}`));
  // Unlike `ThreadWorkspaces.release`, which keeps the workspace's files for the next `acquire`,
  // this ends the thread's processes and deletes its temporary directory too.
  const free = async (threadId: string) => {
    await sandboxes.get(threadId)?.dispose();
    sandboxes.delete(threadId);
    const root = roots.get(threadId);
    roots.delete(threadId);
    if (root) await rm(root, { recursive: true, force: true });
  };
  return {
    roots,
    sandboxes,
    async acquire(thread): Promise<ThreadSandbox> {
      let sandbox = sandboxes.get(thread.id);
      if (!sandbox) {
        const root = await realpath(await mkdtemp(join(tmpdir(), "aven-directory-workspace-")));
        roots.set(thread.id, root);
        await seed?.(root);
        sandbox = new DirectorySandbox(thread.id, root);
        sandboxes.set(thread.id, sandbox);
      }
      const current = sandbox;
      return {
        tools: sandboxTools(current, { id: thread.id, artifacts }),
        hasRunningProcesses: () => hasRunningProcesses(current),
      };
    },
    artifacts,
    uploads,
    skills,
    desktop: () => undefined,
    workspace: async (threadId) => roots.get(threadId),
    release: free,
    async dispose() {
      await Promise.all([...sandboxes.keys()].map(free));
      await rm(artifacts.root, { recursive: true, force: true });
      await rm(uploads.root, { recursive: true, force: true });
      await rm(skills.root, { recursive: true, force: true });
    },
  };
}
