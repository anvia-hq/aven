export const THINKING_LABEL = "Thinking";

const LABELS: Record<string, string> = {
  send_message: "Writing a message",
  list_bots: "Looking at your bots",
  react_to_message: "Reacting to a message",
  exec_command: "Running a command",
  list_files: "Looking through files",
  list_ports: "Checking ports",
  start_process: "Starting a process",
  list_processes: "Checking processes",
  read_process_logs: "Reading a process's output",
  stop_process: "Stopping a process",
  wait_for_port: "Waiting for a port",
  view_image: "Looking at an image",
  web_search: "Searching the web",
  memory: "Checking its notes",
  ask_question: "Asking you a question",
  ask_provider_key: "Asking you for a key",
  create_bot: "Making a bot",
  update_self: "Updating itself",
  list_projects: "Looking at your projects",
  list_threads: "Looking at your threads",
  get_thread: "Reading a thread",
  start_thread: "Starting a thread",
  continue_thread: "Continuing a thread",
  archive_thread: "Archiving a thread",
  stop_thread: "Stopping a thread",
  fork_thread: "Forking a thread",
  fork_status: "Checking a fork",
  stop_fork: "Stopping a fork",
  take_fork_changes: "Taking a fork's changes",
  wait_for_forks: "Waiting for forks",
  git_fetch: "Fetching a branch",
  computer_status: "Checking its computer",
  computer_wake: "Waking its computer",
  list_schedules: "Looking at schedules",
  create_schedule: "Making a schedule",
  update_schedule: "Changing a schedule",
  delete_schedule: "Deleting a schedule",
  get_goal: "Checking its goal",
  start_goal: "Starting a goal",
  define_goal: "Setting a goal",
  update_goal: "Updating its goal",
  list_mcp_servers: "Looking at tool servers",
  add_mcp_server: "Adding a tool server",
  update_mcp_server: "Changing a tool server",
  remove_mcp_server: "Removing a tool server",
  list_providers: "Looking at providers",
  list_provider_models: "Looking at a provider's models",
  add_provider: "Adding a provider",
  update_provider: "Changing a provider",
  remove_provider: "Removing a provider",
  aven_api: "Using Aven",
  aven_api_search: "Looking up how to use Aven",
  cockpit: "Looking at your cockpit",
};

const FILE_LABELS: Record<string, string> = {
  read_file: "Reading",
  write_file: "Writing",
  edit: "Editing",
};

const MAX_LENGTH = 60;

const fileOf = (input: unknown) => {
  const path =
    typeof input === "object" && input !== null && "path" in input ? input.path : undefined;

  return typeof path === "string" ? path.split("/").filter(Boolean).at(-1) : undefined;
};

const clipped = (label: string) =>
  label.length > MAX_LENGTH ? `${label.slice(0, MAX_LENGTH - 1)}…` : label;

export function activityLabelOf(toolName: string, input?: unknown) {
  const known = LABELS[toolName];

  if (known) return known;

  const verb = FILE_LABELS[toolName];

  if (verb) {
    const file = fileOf(input);
    return clipped(file ? `${verb} ${file}` : `${verb} a file`);
  }

  const words = toolName
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

  return clipped(words ? `Using ${words}` : "Using a tool");
}
