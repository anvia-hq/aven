import type { SandboxProcessInfo, SandboxRuntime } from "@anvia/sandbox";
import type { ProcessLogs, ProcessView } from "@aven/protocol/runtime-wire";

// How much of each stream a person is shown: the end of it, which is what a server last said.
const LOG_TAIL_BYTES = 16 * 1024;

const SHELLS = new Set(["sh", "bash", "zsh"]);

// What was run, as the agent wrote it: for `sh -c <script>` the script, otherwise the command line.
function commandLine({ command, args }: Pick<SandboxProcessInfo, "command" | "args">) {
  const shell = command.split("/").pop() ?? command;
  if (SHELLS.has(shell) && args.length === 2 && args[0] === "-c") return args[1] ?? command;
  return [command, ...args].join(" ");
}

export function processView(info: SandboxProcessInfo): ProcessView {
  return {
    id: info.id,
    command: commandLine(info),
    cwd: info.cwd,
    status: info.status,
    exitCode: info.exitCode,
    startedAt: info.startedAt,
    endedAt: info.endedAt,
  };
}

/** What a person can do about the processes in a thread's sandbox (decision 0071). */
export type ThreadProcesses = {
  list(): Promise<ProcessView[]>;
  /** Stops one and answers with the list as it is then. */
  stop(processId: string): Promise<ProcessView[]>;
  logs(processId: string): Promise<ProcessLogs>;
};

/** For a sandbox that cannot run processes, such as a test double. */
export const noProcesses: ThreadProcesses = {
  list: async () => [],
  stop: async () => {
    throw new Error("No such process");
  },
  logs: async () => {
    throw new Error("No such process");
  },
};

// The sandbox's processes. `isUp` says whether the container is there: one that is gone has nothing
// running, and asking it would wait for a daemon that will not answer. What is shown goes through
// `redact` when there is one: a person sees no more than the agent does, and the agent is not shown
// the run's secrets (decision 0045).
export function threadProcesses(
  sandbox: SandboxRuntime,
  isUp: () => boolean,
  redact: () => (<T>(value: T) => T) | undefined = () => undefined,
): ThreadProcesses {
  const requireUp = () => {
    if (!isUp()) throw new Error("The sandbox is not running");
  };
  const hidden = <T>(value: T) => (redact() ?? ((same: T) => same))(value);
  const list = async () =>
    isUp() ? hidden((await sandbox.listProcesses()).map((info) => processView(info))) : [];
  return {
    list,
    async stop(processId) {
      requireUp();
      await sandbox.stopProcess({ processId });
      return list();
    },
    async logs(processId) {
      requireUp();
      const logs = await sandbox.readProcessLogs({ processId, tailBytes: LOG_TAIL_BYTES });
      const text = new TextDecoder();
      return hidden({
        stdout: text.decode(logs.stdout),
        stderr: text.decode(logs.stderr),
        truncated: logs.stdoutTruncated || logs.stderrTruncated,
      });
    },
  };
}
