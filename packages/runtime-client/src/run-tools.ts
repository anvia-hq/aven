import type { AnyTool } from "@anvia/core";
import { createDefineGoalTool, type GoalRequest } from "@aven/agents/tools/define-goal";
import { createGitFetchTool } from "@aven/agents/tools/git-fetch";
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
  /** The tools of the sandbox the run started with. */
  tools: readonly AnyTool[];
  /** The tools of the thread's sandbox as it is now. */
  current: () => readonly AnyTool[] | undefined;
  /** Whether a person is there to answer: only then may the agent save an environment or take on a goal. */
  attended: boolean;
  /** Asks the control plane for read-only access to the thread's repository. */
  repoAccess: () => Promise<RepoAccess>;
  /** The agent handed a goal over. */
  defineGoal: (goal: GoalRequest) => void;
  /** Builds the agent of a subagent the run's agent hands a task to (decision 0057). */
  createSubagent: CreateSubagent;
  /** Tells clients what the run's subagents do. */
  emit: (event: RunEvent) => void;
};

// What the agent of a run can do: the sandbox's tools, pointed at the thread's current sandbox, and
// the runner's own.
export function toolsForRun({
  sandbox,
  thread,
  tools,
  current,
  attended,
  repoAccess,
  defineGoal,
  createSubagent,
  emit,
}: RunToolsInput): AnyTool[] {
  // For a person who has not connected GitHub, so the sandbox cannot fetch itself: it is done
  // here, on the host, with the read-only access the control plane gives this run (decision 0042).
  const gitFetch = createGitFetchTool(async (branch) => {
    const root = await sandbox.workspace(thread.id);
    if (!root) throw new Error("The thread has no workspace yet");
    return fetchBranch(root, await repoAccess(), branch);
  });
  const bound: AnyTool[] = [...lateBoundTools(tools, current), gitFetch];
  // Subagents work with the same tools, so a sandbox released and woken again is theirs too, and
  // what hides this run's secrets from the agent hides them from them.
  const spawnAgent = createSpawnAgentTool(subagentRunner(bound, createSubagent, emit));
  const withSubagents = [...bound, spawnAgent];
  // Only an agent with a person to set the repository up with may save its environment,
  // which can take many minutes (decision 0043); a runner without snapshots has no tool.
  const saveEnvironment = sandbox.saveEnvironment
    ? [createSaveEnvironmentTool(async () => sandbox.saveEnvironment!(thread, await repoAccess()))]
    : [];
  // Only an agent with a person to talk to may take on a goal.
  return attended
    ? [...withSubagents, ...saveEnvironment, createDefineGoalTool(defineGoal)]
    : withSubagents;
}
