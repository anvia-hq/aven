import type { Agent, AnyTool } from "@anvia/core";
import { subagentTools, type SubagentType } from "@aven/agents/subagents";
import type { RunSubagent } from "@aven/agents/tools/spawn-agent";

/** Builds the agent of one subagent: its instructions and step limit are the type's. */
export type CreateSubagent = (input: {
  type: SubagentType;
  id: string;
  tools: AnyTool[];
}) => Agent<unknown>;

// Runs a subagent on a task to its end and returns its last message (decision 0057). A subagent
// is a plain agent run: not journaled, with a context of its own, so what it reads never reaches
// the run's. `tools` are the ones the run's agent has; each type works with its share of them.
export function subagentRunner(tools: readonly AnyTool[], create: CreateSubagent): RunSubagent {
  return async ({ type, prompt }, { index, abortSignal }) => {
    const agent = create({
      type,
      id: `subagent-${type}-${index}`,
      tools: subagentTools(type, tools),
    });
    const stream = agent.stream({ prompt, abortSignal });
    for await (const _event of stream);
    const outcome = await stream.result;
    if (outcome.type === "response") return outcome.text;
    // It has no question tools, and the guardrails are the model's own: neither should happen.
    throw new Error(
      outcome.type === "blocked"
        ? `The subagent was blocked: ${outcome.reason}`
        : "The subagent stopped to ask a question, which it cannot do",
    );
  };
}
