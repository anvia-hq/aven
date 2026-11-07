import { WORKSPACE_DIR } from "@aven/agents/sandbox-tools";
import type { TerminalShellInput } from "./types";

export function terminalShell({ container, sessionId, project }: TerminalShellInput) {
  const pidFile = `/tmp/.aven-terminal-${sessionId}`;
  const argv = [
    "docker",
    "exec",
    "-it",
    "-w",
    WORKSPACE_DIR,
    "-e",
    "TERM=xterm-256color",
    ...Object.keys(project).flatMap((variable) => ["-e", variable]),
    container,
    "sh",
    "-c",
    `echo $$ > ${pidFile}; exec bash`,
  ];
  const hangup = [
    "docker",
    "exec",
    container,
    "sh",
    "-c",
    `pid=$(cat ${pidFile} 2>/dev/null) && pkill -HUP -s "$pid"; rm -f ${pidFile}`,
  ];
  return { argv, env: { ...process.env, ...project } as Record<string, string>, hangup };
}
