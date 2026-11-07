import type { AnyTool } from "@anvia/core";
import { createDefineGoalTool } from "@aven/agents/tools/define-goal";
import { createForkTools } from "@aven/agents/tools/forks";
import { createGitFetchTool } from "@aven/agents/tools/git-fetch";
import { createCockpitTool } from "@aven/agents/tools/cockpit";
import { createMemoryTool } from "@aven/agents/tools/memory";
import { createSaveEnvironmentTool } from "@aven/agents/tools/save-environment";
import { createSpawnAgentTool } from "@aven/agents/tools/spawn-agent";

import { fetchBranch } from "./fetch-branch";
import { lateBoundTools } from "./late-bound-tools";
import { subagentRunner } from "./subagent-runner";
import type { RunToolsInput } from "./types";

export function toolsForRun({
  sandbox,
  thread,
  tools,
  current,
  mcp,
  attended,
  repoAccess,
  defineGoal,
  createSubagent,
  emit,
  memory,
  forks,
  cockpit,
}: RunToolsInput): AnyTool[] {
  const gitFetch = createGitFetchTool(async (branch) => {
    const root = await sandbox.workspace(thread.id);
    if (!root) throw new Error("The thread has no workspace yet");
    return fetchBranch(root, await repoAccess(), branch);
  });
  const bound: AnyTool[] = [...lateBoundTools(tools, current), gitFetch];
  if (mcp) {
    bound.push(
      ...lateBoundTools(
        mcp.tools,
        mcp.current,
        (name) => `The MCP server of ${name} is not connected, so it is unavailable`,
      ),
    );
  }
  const spawnAgent = createSpawnAgentTool(subagentRunner(bound, createSubagent, emit));
  const notes = memory ? [createMemoryTool(memory)] : [];
  const reading = cockpit ? [createCockpitTool(cockpit, "read")] : [];
  const forking = forks ? createForkTools(forks) : [];
  const withSubagents = [...bound, spawnAgent, ...notes, ...reading, ...forking];
  const saveEnvironment = sandbox.saveEnvironment
    ? [createSaveEnvironmentTool(async () => sandbox.saveEnvironment!(thread, await repoAccess()))]
    : [];
  return attended
    ? [...withSubagents, ...saveEnvironment, createDefineGoalTool(defineGoal)]
    : withSubagents;
}
