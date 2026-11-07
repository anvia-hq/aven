import type { AnyTool } from "@anvia/core";
import { createSandboxTools, type SandboxRuntime } from "@anvia/sandbox";
import { SANDBOX_TOOL_NAMES } from "@aven/agents/sandbox-tools";
import { createEditTool } from "@aven/agents/tools/edit";
import { createShowArtifactTool } from "@aven/agents/tools/show-artifact";

import type { ArtifactStore } from "./artifacts";
import { withBackground } from "./background-command";

// How long a foreground command may run unless the agent asks for less; the sandbox caps it at 5.
const EXEC_DEFAULT_TIMEOUT_MS = 2 * 60_000;
// `read_file` takes up to this many lines in a call, which is what its own schema allows; the
// sandbox's policy would otherwise stop at 2000 and fail a read the schema invited. How much comes
// back in one read is still limited in bytes.
const READ_FILE_MAX_LINES = 10_000;

// What an agent can do in a thread's sandbox: everything @anvia/sandbox offers on files, commands
// and processes (a command can be run in the background), plus `edit` (the sandbox has no in-place edit) built on its file calls, and
// `show_artifact`, which keeps what it shows in `artifacts` (decisions 0033 and 0136).
export function sandboxTools(
  sandbox: SandboxRuntime,
  thread: { id: string; artifacts: ArtifactStore },
): readonly AnyTool[] {
  const own = createSandboxTools({
    sandbox,
    tools: SANDBOX_TOOL_NAMES,
    exec: { defaultTimeoutMs: EXEC_DEFAULT_TIMEOUT_MS },
    readFile: { maxLineCount: READ_FILE_MAX_LINES },
  });
  const start = own.find((tool) => tool.name === "start_process");
  return [
    // `exec_command` can run a command in the background, as `start_process` does (decision 0071).
    ...own.map((tool) =>
      tool.name === "exec_command" && start ? withBackground(tool, start) : tool,
    ),
    createEditTool(sandbox),
    createShowArtifactTool({
      readFile: (options) => sandbox.readFile(options),
      save: (bytes, mediaType) => thread.artifacts.save(thread.id, bytes, mediaType),
    }),
  ];
}

// Whether the thread's sandbox still has a managed process running, such as a dev server.
export async function hasRunningProcesses(sandbox: SandboxRuntime) {
  const processes = await sandbox.listProcesses();
  return processes.some((process) => process.status === "running");
}
