import type {
  SandboxExecOptions,
  SandboxExecResult,
  SandboxFileEntry,
  SandboxProcessInfo,
  SandboxProcessLogs,
  SandboxRuntime,
  SandboxTextFilePage,
} from "@anvia/sandbox";

import type { MachineCall } from "./types";

const encoder = new TextEncoder();

type Encoded<T> = Omit<T, "stdout" | "stderr"> & { stdout: string; stderr: string };

const decoded = <T extends { stdout: Uint8Array; stderr: Uint8Array }>(result: Encoded<T>) =>
  ({
    ...result,
    stdout: Uint8Array.fromBase64(result.stdout),
    stderr: Uint8Array.fromBase64(result.stderr),
  }) as T;

export class RemoteSandbox implements SandboxRuntime {
  readonly provider = "machine";
  readonly publishedPorts = [] as const;

  constructor(
    readonly id: string,
    private call: MachineCall,
    private workspace: () => string | undefined,
  ) {}

  get workdir() {
    return this.workspace() ?? ".";
  }

  async exec({ abortSignal, ...options }: SandboxExecOptions): Promise<SandboxExecResult> {
    if (!abortSignal) return this.#command(options);
    const operationId = options.operationId || crypto.randomUUID();
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void this.call("exec.abort", { operationId }).catch(() => undefined);
    };
    abortSignal.addEventListener("abort", stop, { once: true });
    if (abortSignal.aborted) stop();
    try {
      return await this.#command({ ...options, operationId });
    } finally {
      abortSignal.removeEventListener("abort", stop);
    }
  }

  async #command(options: Omit<SandboxExecOptions, "abortSignal">) {
    return decoded(
      (await this.call("exec", options)) as Encoded<SandboxExecResult & { stdout: Uint8Array }>,
    );
  }

  async *execStream(options: SandboxExecOptions) {
    yield { type: "result" as const, result: await this.exec(options) };
  }

  async readFile({ path }: { path: string }) {
    const { data } = (await this.call("readFile", { path })) as { data: string };
    return Uint8Array.fromBase64(data);
  }

  async readTextFile(options: { path: string }) {
    return new TextDecoder().decode(await this.readFile(options));
  }

  async readTextFilePage(options: { path: string; startLine?: number; lineCount?: number }) {
    return (await this.call("readTextFilePage", options)) as SandboxTextFilePage;
  }

  async writeFile({ path, data }: { path: string; data: Uint8Array }) {
    await this.call("writeFile", { path, data: data.toBase64() });
  }

  async writeTextFile({ path, text }: { path: string; text: string }) {
    await this.writeFile({ path, data: encoder.encode(text) });
  }

  async listFiles(options: { path?: string } = {}) {
    return (await this.call("listFiles", options)) as SandboxFileEntry[];
  }

  async startProcess(options: Parameters<SandboxRuntime["startProcess"]>[0]) {
    return (await this.call("startProcess", options)) as SandboxProcessInfo;
  }

  async listProcesses() {
    return (await this.call("listProcesses")) as SandboxProcessInfo[];
  }

  async readProcessLogs(options: { processId: string; tailBytes?: number }) {
    return decoded((await this.call("readProcessLogs", options)) as Encoded<SandboxProcessLogs>);
  }

  async stopProcess({ processId }: { processId: string }) {
    return (await this.call("stopProcess", { processId })) as SandboxProcessInfo;
  }

  async waitForPort(): Promise<never> {
    throw new Error("waitForPort is not supported on a machine reached from elsewhere");
  }
}
