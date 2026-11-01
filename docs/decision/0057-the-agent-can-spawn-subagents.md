# The agent can hand tasks to subagents

Status: accepted. Builds on [0012](0012-agent-tools-come-from-the-sandbox.md), [0021](0021-runs-go-through-anvia-durable.md) and [0022](0022-long-running-work-is-a-durable-goal.md).

## Context

An agent that explores a large repository fills its own context window with what it reads, and works through independent questions one after another. Claude Code answers both with a delegation tool: the agent gives a task and a prompt, a subagent works on it with a clean context, and only its last message comes back as the tool's result.

Anvia has `agent.asTool()` for this, which takes one fixed agent and a bare `{ prompt }`. Two things stood in the way of using it as it is. `@anvia/durable` journals a run's events and has no event for a tool's child stream, so a child's `emitStreamEvent` never reaches a client. And Anvia runs tool calls one at a time whenever the agent has a question tool, which an attended agent always does, so the agent calling the tool six times in a turn would not run them together.

## Decision

- **One tool, `spawn_agent`** (`@aven/agents/tools/spawn-agent`), takes `tasks`: one to six of `{ description, prompt, type }`. All of them start at once (`Promise.all` inside the tool, which sidesteps the one-call-at-a-time rule) and the result is every task's outcome in the order asked: `done` with the subagent's last message, or `error` with why. One failing subagent does not fail the call. A cancelled run fails it.
- **Two types** (`subagents.ts`). `explore` has `exec_command`, `read_file`, `list_files`, `list_ports`, `list_processes` and `read_process_logs`, and is told to only read: a shell can write, so that is the instructions' word, not a guarantee. `general` has the run's agent's tools. No subagent has `ask_user`, `request_secret`, `define_goal`, `save_environment`, `show_image` or `spawn_agent`: it cannot ask the user, take on a goal, change the environment or spawn, and the parent shows the user what there is to show. `subagentTools` filters on that list whatever it is handed.
- **A subagent is a plain agent run, not a journaled one** (`runtime-client/src/subagent-runner.ts`). It has a context of its own, its type's instructions (`subagent-instruction.ts`), the run's model, a limit of 200 steps (30 until decision 0076) and the run's tools: the late-bound ones, so a sandbox released and woken again is theirs too, and what hides the run's secrets from the agent hides them from the subagents. It shares the thread's sandbox, workspace and branch with the agent and with the other subagents.
- **What a subagent does is sent outside the journal.** The runner forwards a `subagent` run event for each tool it calls and for its end, and a `usage` event per model call without a context figure (the tokens count toward the thread; the Context card is the agent's window). The control plane accepts both, and wire version is 23. A `spawn_agent` tool part carries its `subagents` (description, type, status, tools, output), so every card is there from the first event and a rebuilt transcript has how each ended.
- **Events name no call.** An agent runs one tool call at a time, so a `subagent` event is for the latest running `spawn_agent` call, by the subagent's index. Anvia's tool context does not give a tool its call's id.
- **The agent is told when to delegate** (`<delegation>` in `instruction.ts`): to explore, to look into independent questions together, for self-contained work; not for a step or two; with a full brief, since a subagent has none of the conversation; and to check what comes back, since the user does not see it.
- **The platform draws one card per subagent** (`subagent-card.tsx`): its description and type, the tool it is on while it works, and a tick or an error. Opened, it lists its tools and what it sent back.

## Consequences

- A subagent's work, and its tokens after a reload, are not kept: the control plane stores the agent's messages, so a reloaded thread shows each card with how it ended and what it said, but not the tools it called, and the Usage card counts only the agent's own model calls once the run is over.
- A runner that restarts while a `spawn_agent` call runs tells the agent the outcome is unknown, as for any command (`spawn_agent` is not in `SAFE_TOOLS`): its subagents' work in the workspace may be partly done.
- A subagent has no compaction. Thirty steps of file reads can pass a small context window, and the subagent then fails with the model's error, which the agent sees as that task's error.
- Subagents that change files at the same time share one workspace. The instructions ask the agent to give them different files; nothing enforces it. A worktree for each is the next step if it matters.
- Six model calls can be in flight for one run; the gateway and the provider's rate limits see them as they would six runs.
- The macOS client ignores the `subagent` event, as it does any type it does not know, and shows the call as a tool.
