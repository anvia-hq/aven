import type { SandboxProcessInfo, SandboxRuntime } from "@anvia/sandbox";
import type { ProcessView } from "@aven/protocol/types";
import type { ThreadProcesses } from "./types";

const LOG_TAIL_BYTES = 16 * 1024;

const SHELLS = new Set(["sh", "bash", "zsh"]);

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

export const noProcesses: ThreadProcesses = {
  start: async () => {
    throw new Error("The sandbox is not running");
  },
  list: async () => [],
  stop: async () => {
    throw new Error("No such process");
  },
  logs: async () => {
    throw new Error("No such process");
  },
};

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
    async start(command) {
      requireUp();
      const started = await sandbox.startProcess({ command: "sh", args: ["-c", command] });
      const info = (await sandbox.listProcesses()).find((process) => process.id === started.id);

      if (!info) throw new Error("The command did not start");

      return hidden(processView(info));
    },
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
