import { VIEW_IMAGE_TOOL_NAME } from "@aven/protocol/events";

import { API_SEARCH_TOOL_NAME, API_TOOL_NAME } from "./tools/api";
import { ASK_QUESTION_TOOL_NAME } from "./tools/ask-question";
import { COCKPIT_TOOL_NAME } from "./tools/cockpit";
import { COMPUTER_STATUS_TOOL_NAME, COMPUTER_WAKE_TOOL_NAME } from "./tools/computer";
import { CREATE_BOT_TOOL_NAME } from "./tools/create-bot";
import { DEFINE_GOAL_TOOL_NAME } from "./tools/define-goal";
import { DELETE_BOT_TOOL_NAME } from "./tools/delete-bot";
import { EDIT_TOOL_NAME } from "./tools/edit";
import { FIND_TOOL_NAME } from "./tools/find";
import {
  FORK_STATUS_TOOL_NAME,
  FORK_THREAD_TOOL_NAME,
  STOP_FORK_TOOL_NAME,
  TAKE_FORK_CHANGES_TOOL_NAME,
} from "./tools/forks";
import { GIT_FETCH_TOOL_NAME } from "./tools/git-fetch";
import { GLOB_TOOL_NAME } from "./tools/glob";
import { GET_GOAL_TOOL_NAME, START_GOAL_TOOL_NAME, UPDATE_GOAL_TOOL_NAME } from "./tools/goals";
import { GREP_TOOL_NAME } from "./tools/grep";
import { LIST_BOTS_TOOL_NAME } from "./tools/list-bots";
import {
  ADD_MCP_SERVER_TOOL_NAME,
  LIST_MCP_SERVERS_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  UPDATE_MCP_SERVER_TOOL_NAME,
} from "./tools/mcp-servers";
import { MEMORY_TOOL_NAME } from "./tools/memory";
import {
  ADD_PROVIDER_TOOL_NAME,
  ASK_PROVIDER_KEY_TOOL_NAME,
  LIST_PROVIDER_MODELS_TOOL_NAME,
  LIST_PROVIDERS_TOOL_NAME,
  REMOVE_PROVIDER_TOOL_NAME,
  UPDATE_PROVIDER_TOOL_NAME,
} from "./tools/providers";
import { REACT_TO_MESSAGE_TOOL_NAME } from "./tools/react-to-message";
import { READ_PROJECT_FILE_TOOL_NAME } from "./tools/read-project-file";
import {
  CREATE_SCHEDULE_TOOL_NAME,
  DELETE_SCHEDULE_TOOL_NAME,
  LIST_SCHEDULES_TOOL_NAME,
  UPDATE_SCHEDULE_TOOL_NAME,
} from "./tools/schedules";
import { SEND_MESSAGE_TOOL_NAME } from "./tools/send-message";
import {
  ANSWER_THREAD_QUESTION_TOOL_NAME,
  ARCHIVE_THREAD_TOOL_NAME,
  CONTINUE_THREAD_TOOL_NAME,
  GET_THREAD_TOOL_NAME,
  LIST_PROJECTS_TOOL_NAME,
  LIST_THREADS_TOOL_NAME,
  START_THREAD_TOOL_NAME,
  STOP_THREAD_TOOL_NAME,
} from "./tools/threads";
import { TODO_TOOL_NAME } from "./tools/todo";
import { UPDATE_SELF_TOOL_NAME } from "./tools/update-self";
import { WAIT_FOR_FORKS_TOOL_NAME } from "./tools/wait-for-forks";
import { WEB_FETCH_TOOL_NAME } from "./tools/web-fetch";
import { WEB_SEARCH_TOOL_NAME } from "./tools/web-search";

export const THINKING_LABEL = "Thinking";

const LABELS: Record<string, string> = {
  [SEND_MESSAGE_TOOL_NAME]: "Writing a message",
  [LIST_BOTS_TOOL_NAME]: "Looking at your bots",
  [REACT_TO_MESSAGE_TOOL_NAME]: "Reacting to a message",
  exec_command: "Running a command",
  list_files: "Looking through files",
  list_ports: "Checking ports",
  start_process: "Starting a process",
  list_processes: "Checking processes",
  read_process_logs: "Reading a process's output",
  stop_process: "Stopping a process",
  wait_for_port: "Waiting for a port",
  [VIEW_IMAGE_TOOL_NAME]: "Looking at an image",
  [WEB_SEARCH_TOOL_NAME]: "Searching the web",
  [WEB_FETCH_TOOL_NAME]: "Reading a web page",
  [GREP_TOOL_NAME]: "Searching through files",
  [FIND_TOOL_NAME]: "Looking for files",
  [GLOB_TOOL_NAME]: "Looking for files",
  [TODO_TOOL_NAME]: "Updating its task list",
  [MEMORY_TOOL_NAME]: "Checking its notes",
  [ASK_QUESTION_TOOL_NAME]: "Asking you a question",
  [ASK_PROVIDER_KEY_TOOL_NAME]: "Asking you for a key",
  [CREATE_BOT_TOOL_NAME]: "Making a bot",
  [DELETE_BOT_TOOL_NAME]: "Deleting a bot",
  [UPDATE_SELF_TOOL_NAME]: "Updating itself",
  [LIST_PROJECTS_TOOL_NAME]: "Looking at your projects",
  [READ_PROJECT_FILE_TOOL_NAME]: "Reading a project file",
  [LIST_THREADS_TOOL_NAME]: "Looking at your threads",
  [GET_THREAD_TOOL_NAME]: "Reading a thread",
  [START_THREAD_TOOL_NAME]: "Starting a thread",
  [CONTINUE_THREAD_TOOL_NAME]: "Continuing a thread",
  [ARCHIVE_THREAD_TOOL_NAME]: "Archiving a thread",
  [STOP_THREAD_TOOL_NAME]: "Stopping a thread",
  [ANSWER_THREAD_QUESTION_TOOL_NAME]: "Answering a thread's question",
  [FORK_THREAD_TOOL_NAME]: "Forking a thread",
  [FORK_STATUS_TOOL_NAME]: "Checking a fork",
  [STOP_FORK_TOOL_NAME]: "Stopping a fork",
  [TAKE_FORK_CHANGES_TOOL_NAME]: "Taking a fork's changes",
  [WAIT_FOR_FORKS_TOOL_NAME]: "Waiting for forks",
  [GIT_FETCH_TOOL_NAME]: "Fetching a branch",
  [COMPUTER_STATUS_TOOL_NAME]: "Checking its computer",
  [COMPUTER_WAKE_TOOL_NAME]: "Waking its computer",
  [LIST_SCHEDULES_TOOL_NAME]: "Looking at schedules",
  [CREATE_SCHEDULE_TOOL_NAME]: "Making a schedule",
  [UPDATE_SCHEDULE_TOOL_NAME]: "Changing a schedule",
  [DELETE_SCHEDULE_TOOL_NAME]: "Deleting a schedule",
  [GET_GOAL_TOOL_NAME]: "Checking its goal",
  [START_GOAL_TOOL_NAME]: "Starting a goal",
  [DEFINE_GOAL_TOOL_NAME]: "Setting a goal",
  [UPDATE_GOAL_TOOL_NAME]: "Updating its goal",
  [LIST_MCP_SERVERS_TOOL_NAME]: "Looking at tool servers",
  [ADD_MCP_SERVER_TOOL_NAME]: "Adding a tool server",
  [UPDATE_MCP_SERVER_TOOL_NAME]: "Changing a tool server",
  [REMOVE_MCP_SERVER_TOOL_NAME]: "Removing a tool server",
  [LIST_PROVIDERS_TOOL_NAME]: "Looking at providers",
  [LIST_PROVIDER_MODELS_TOOL_NAME]: "Looking at a provider's models",
  [ADD_PROVIDER_TOOL_NAME]: "Adding a provider",
  [UPDATE_PROVIDER_TOOL_NAME]: "Changing a provider",
  [REMOVE_PROVIDER_TOOL_NAME]: "Removing a provider",
  [API_TOOL_NAME]: "Using Aven",
  [API_SEARCH_TOOL_NAME]: "Looking up how to use Aven",
  [COCKPIT_TOOL_NAME]: "Looking at your cockpit",
};

const FILE_LABELS: Record<string, string> = {
  read_file: "Reading",
  write_file: "Writing",
  [EDIT_TOOL_NAME]: "Editing",
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
