import type { AnyTool } from "@anvia/core";
import { createSandboxTools, type SandboxRuntime } from "@anvia/sandbox";
import { SANDBOX_TOOL_NAMES } from "@aven/agents/sandbox-tools";
import { createEditTool } from "@aven/agents/tools/edit";
import { createFindTool } from "@aven/agents/tools/find";
import { createGlobTool } from "@aven/agents/tools/glob";
import { createGrepTool } from "@aven/agents/tools/grep";
import { createShowArtifactTool } from "@aven/agents/tools/show-artifact";
import { createTodoTool } from "@aven/agents/tools/todo";
import { createViewImageTool } from "@aven/agents/tools/view-image";
import { createWebFetchTool } from "@aven/agents/tools/web-fetch";

import type { ArtifactStore } from "./artifacts";
import { withBackground } from "./background-command";

const EXEC_DEFAULT_TIMEOUT_MS = 2 * 60_000;
const READ_FILE_MAX_LINES = 10_000;

export function sandboxTools(
  sandbox: SandboxRuntime,
  thread: { id: string; artifacts: Pick<ArtifactStore, "save"> },
): readonly AnyTool[] {
  const own = createSandboxTools({
    sandbox,
    tools: SANDBOX_TOOL_NAMES,
    exec: { defaultTimeoutMs: EXEC_DEFAULT_TIMEOUT_MS },
    readFile: { maxLineCount: READ_FILE_MAX_LINES },
  });
  const start = own.find((tool) => tool.name === "start_process");
  return [
    ...own.map((tool) =>
      tool.name === "exec_command" && start ? withBackground(tool, start) : tool,
    ),
    createEditTool(sandbox),
    createGrepTool(sandbox),
    createFindTool(sandbox),
    createGlobTool(sandbox),
    createWebFetchTool(),
    createTodoTool(),
    createViewImageTool(sandbox),
    createShowArtifactTool({
      readFile: (options) => sandbox.readFile(options),
      save: (bytes, mediaType) => thread.artifacts.save(thread.id, bytes, mediaType),
    }),
  ];
}

export async function hasRunningProcesses(sandbox: SandboxRuntime) {
  const processes = await sandbox.listProcesses();
  return processes.some((process) => process.status === "running");
}
