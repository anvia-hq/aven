import type { AnyTool } from "@anvia/core";
import { createDefineGoalTool, type GoalRequest } from "@aven/agents/tools/define-goal";
import { createForkTools, type ForkHost } from "@aven/agents/tools/forks";
import { createGitFetchTool } from "@aven/agents/tools/git-fetch";
import { createCockpitTool, type CockpitHost } from "@aven/agents/tools/cockpit";
import { createMemoryTool, type MemoryHost } from "@aven/agents/tools/memory";
import { createSaveEnvironmentTool } from "@aven/agents/tools/save-environment";
import { createSpawnAgentTool } from "@aven/agents/tools/spawn-agent";
import type { RunEvent } from "@aven/protocol/events";
import type { RepoAccess, RunThreadInfo } from "@aven/protocol/runtime-wire";

import { fetchBranch } from "./fetch-branch";
import { lateBoundTools } from "./late-bound-tools";
import type { ThreadWorkspaces } from "./sandbox";
import { subagentRunner, type CreateSubagent } from "./subagent-runner";

export type RunToolsInput = {
  sandbox: ThreadWorkspaces;
  thread: RunThreadInfo;
  tools: readonly AnyTool[];
  current: () => readonly AnyTool[] | undefined;
  mcp?: { tools: readonly AnyTool[]; current: () => readonly AnyTool[] | undefined };
  attended: boolean;
  repoAccess: () => Promise<RepoAccess>;
  defineGoal: (goal: GoalRequest) => void;
  createSubagent: CreateSubagent;
  emit: (event: RunEvent) => void;
  memory?: MemoryHost;
  forks?: ForkHost;
  cockpit?: CockpitHost;
};

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
