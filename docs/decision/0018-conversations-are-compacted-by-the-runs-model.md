# Long conversations are compacted by the run's own model

Status: accepted.

## Context

A thread's history grew without limit, so a long thread eventually overflowed the model's context window. `@anvia/core` can summarize the old part of a history (`memory.compaction`) when the store supports `snapshot` and `replacePrefix`. The control plane's Drizzle store does; a runner's `remote-memory` did not, and the runner is what runs the agent.

## Decision

- **Compaction is on** whenever the store supports it and the model's context window is known. Once the projected context passes 70% of the window (`COMPACT_AT` in `coding-agent.ts`), the older messages are replaced by a summary; canonical messages stay stored.
- **The run's own model writes the summary**, through the same gateway token, so no extra provider or key is involved.
- **A runner compacts through two calls home**, `memory.snapshot` and `memory.replacePrefix`, bound to the run's thread by the control plane like every other memory call. The wire version is 6.
- Without a known context window nothing is compacted.

## Consequences

- A run may make one extra model call to summarize, billed to the sender's provider.
- A runner older than version 6 is refused at hello, as with any wire change.
- The threshold is a constant, not a setting; change it if 70% proves too early or late.
