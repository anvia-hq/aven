# The person can compact a thread

Status: accepted. Builds on 0021 (runs through `@anvia/durable`, whose journal holds the model's history), 0036 (the composer's `/`) and 0076 (the Context card's window and the turn limit).

## Context

A thread's history is summarized on its own once it passes 70% of the model's context window (`compactionFor`). A person who watches the Context card fill has no way to do it sooner, say before a long task or after the agent wandered, which is what `/compact` and a Compact button are in other tools.

The history is `@anvia/durable`'s, in the runner's journal, and compaction happens only inside a run: as a run starts, if the history and the prompt are over the trigger registered with the run's agent, everything before the retained turns becomes a summary (a checkpoint) that the session's next runs carry. There is no call that compacts a session and nothing else, and a checkpoint is applied only to a run whose agent also registers a compaction policy, which every run of a model with a known window does.

## Decision

- **Compacting is a run of its own**: `POST /threads/:id/compact` (the creator only, 202, the body the composer's model choice like Ship's) starts a run with `compact: true` on `run.start` (wire version 38) and the prompt `/compact`. The thread shows `/compact` as the person's message and the agent's note as the reply, like any other turn. It is refused while a run is going or a question waits, as a message is.
- **The run needs no sandbox and no tools.** The runner takes a separate path for it (`compactionScope` in `run-driver.ts`): no container is started or woken, no GitHub, identity, variables, skills or MCP are brought, and nothing of the thread's workspace is marked. Its agent (`createCompactionAgent`, `@aven/agents/compaction-agent`) registers a trigger of one token and no recent turn to keep, so everything before the prompt is summarized whatever the window; the summary is written by the person's own model through the gateway, by Anvia's summary compactor. The agent's own model is a local one that answers from the request, so there is no second provider call: it says the conversation was compacted when the request has the summary in it, and that there was nothing to compact otherwise, and reports the request's size as the tokens it used, which the Context card then shows as the new size.
- **The person asks from two places**: the Context card's Compact button (it keeps its place, disabled, while the agent works, so the column does not change height), and `/compact` in a thread's composer, which `/` offers before the skills. Picking it puts a chip in the composer; sending a message that is only that chip runs the command, any other text is a message as it was. A skill cannot be named like it, since a skill's name has no slash.
- **The wire version goes to 38**, so a runner that has not updated is refused until `aven update` rather than answering `/compact` as a prompt.

## Consequences

- The `/compact` turn and its reply stay in the model's history, after the summary: a few tokens, and the model sees that the person compacted.
- A model whose context window is not known has no compaction policy, so a checkpoint is not applied to its next runs: the Context card is not shown for it either, so there is no button, and a request made some other way would summarize with no effect on later runs.
- The summary costs one model call, on the model the composer shows, billed like the thread's other calls.
- Tested with `durable-runs.test.ts` (the summary reaches the next run's request), `runner.test.ts` (no sandbox is acquired) and `e2e/compact.spec.ts` (the button and the command).
