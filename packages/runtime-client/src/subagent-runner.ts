import type { Agent, AnyTool } from "@anvia/core";
import { projectSubagentEvent } from "@aven/agents/projection";
import { subagentTools, type SubagentType } from "@aven/agents/subagents";
import { clip } from "@aven/agents/tool-projection";
import type { RunSubagent } from "@aven/agents/tools/spawn-agent";
import { errorMessage } from "@aven/agents/values";
import type { RunEvent } from "@aven/protocol/events";

/** Builds the agent of one subagent: its instructions and step limit are the type's. */
export type CreateSubagent = (input: {
  type: SubagentType;
  id: string;
  tools: AnyTool[];
}) => Agent<unknown>;

// Runs a subagent on a task to its end and returns its last message (decision 0057). A subagent
// is a plain agent run: not journaled, with a context of its own, so what it reads never reaches
// the run's. `tools` are the ones the run's agent has; each type works with its share of them.
// What it does is told to `emit` as it goes, outside the journal: a client watches it live, and a
// run taken up after a restart repeats the whole call, so there is nothing to catch up on.
export function subagentRunner(
  tools: readonly AnyTool[],
  create: CreateSubagent,
  emit: (event: RunEvent) => void,
): RunSubagent {
  return async ({ type, prompt }, { index, abortSignal }) => {
    const end = (status: "done" | "error", output: string) =>
      emit({ type: "subagent", index, event: { type: "end", status, output: clip(output) } });
    try {
      const agent = create({
        type,
        id: `subagent-${type}-${index}`,
        tools: subagentTools(type, tools),
      });
      const stream = agent.stream({ prompt, abortSignal });
      for await (const event of stream) {
        const projected = projectSubagentEvent(event, index);
        if (projected) emit(projected);
      }
      const outcome = await stream.result;
      if (outcome.type !== "response") {
        // It has no question tools, and the guardrails are the model's own: neither should happen.
        throw new Error(
          outcome.type === "blocked"
            ? `The subagent was blocked: ${outcome.reason}`
            : "The subagent stopped to ask a question, which it cannot do",
        );
      }
      end("done", outcome.text);
      return outcome.text;
    } catch (error) {
      end("error", errorMessage(error));
      throw error;
    }
  };
}
