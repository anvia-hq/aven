import type { AnyTool } from "@anvia/core";
import { createSandboxTools, type SandboxRuntime } from "@anvia/sandbox";
import { SANDBOX_TOOL_NAMES } from "@aven/agents/sandbox-tools";
import { createEditTool } from "@aven/agents/tools/edit";

// How long a foreground command may run unless the agent asks for less; the sandbox caps it at 5.
const EXEC_DEFAULT_TIMEOUT_MS = 2 * 60_000;

// What an agent can do in a thread's sandbox: everything @anvia/sandbox offers on files, commands
// and processes, plus `edit` (the sandbox has no in-place edit) built on its file calls.
export function sandboxTools(sandbox: SandboxRuntime): readonly AnyTool[] {
  return [
    ...createSandboxTools({
      sandbox,
      tools: SANDBOX_TOOL_NAMES,
      exec: { defaultTimeoutMs: EXEC_DEFAULT_TIMEOUT_MS },
    }),
    createEditTool(sandbox),
  ];
}

// Whether the thread's sandbox still has a managed process running, such as a dev server.
export async function hasRunningProcesses(sandbox: SandboxRuntime) {
  const processes = await sandbox.listProcesses();
  return processes.some((process) => process.status === "running");
}
