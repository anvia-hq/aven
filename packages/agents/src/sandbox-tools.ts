// The tools of @anvia/sandbox the agent works with (decision 0012), by name. The host builds them;
// this is what the rest of Aven knows them as.
export const SANDBOX_TOOL_NAMES = [
  "exec_command",
  "read_file",
  "write_file",
  "list_files",
  "list_ports",
  "start_process",
  "list_processes",
  "read_process_logs",
  "stop_process",
  "wait_for_port",
] as const;

export type SandboxToolName = (typeof SANDBOX_TOOL_NAMES)[number];
