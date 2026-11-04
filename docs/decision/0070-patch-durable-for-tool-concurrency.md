# Patch `@anvia/durable` so a thread's agent can run tool calls side by side

Status: accepted, temporary. Remove the patch when Anvia has the setting upstream (`docs/bugs/0005-anvia-durable-has-no-tool-concurrency.md`).

## Context

Anvia runs the tool calls of one model turn one at a time unless a run says `toolConcurrency`. It is a setting of a run, not of an agent, and every run of a thread goes through `@anvia/durable`, which builds the run's options itself and gives its caller no way to add this one. A turn that reads five files, or starts several commands, waits for each in turn.

## Decision

- **A local patch of `@anvia/durable`**, originally 0.12.2 and carried forward to 0.13.0, kept with `bun patch` (`patches/@anvia%2Fdurable@0.13.0.patch`, `patchedDependencies` in the root `package.json`): an agent registration may carry `toolConcurrency`, a positive integer that is checked when the agent is registered and given to every run of that agent. Without it nothing changes. Durable starts an agent in one place, so runs, answered questions and goal sessions all get it.
- **Our registration sets it to 4** (`TOOL_CONCURRENCY` in `durable-runs.ts`), for the thread's agent. Subagents are not durable runs and keep Anvia's default of one.
- **The agent's version is not bumped**: the tools and instructions are the same, and a bump would stop unfinished runs as "needs attention".
- The change goes to Anvia upstream later; until then the patch is ours.

## Consequences

- Anvia keeps the concurrency at one for an agent that has a question tool or a tool that may need approval. A run with a person to answer has `ask_user` and `request_secret`, so it still runs its tools one at a time; the setting speeds up the runs with no one to answer (goal sessions). A test says so, and changes when Anvia lifts that rule.
- Tool calls of a turn share one sandbox. Calls that read, or that start separate commands, do not mind; two `edit` calls on the same file in one turn could overwrite each other.
- `bun install` applies the patch; upgrading `@anvia/durable` makes `bun patch` fail loudly, which is the moment to check whether upstream has the setting.
