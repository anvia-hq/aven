import { WORKSPACE_DIR } from "@aven/agents/sandbox-tools";

export type TerminalShellInput = {
  /** The thread's container. */
  container: string;
  /** Names the shell, so its processes can be found again to end them. */
  sessionId: string;
  /** The project's variables of the thread's latest run. */
  project: Readonly<Record<string, string>>;
};

// The command that opens a shell in a thread's container, and the one that ends it and what it
// started, which Docker does not do when the client of an `exec` goes away (decision 0053).
export function terminalShell({ container, sessionId, project }: TerminalShellInput) {
  // The shell is its session's leader, so its pid, kept in a file, names every process of it.
  const pidFile = `/tmp/.aven-terminal-${sessionId}`;
  const argv = [
    "docker",
    "exec",
    "-it",
    "-w",
    WORKSPACE_DIR,
    "-e",
    "TERM=xterm-256color",
    // Named without a value, Docker takes each from this command's own environment.
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
