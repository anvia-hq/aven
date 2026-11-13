# 0263. A compaction is one line in the thread

Compacting a thread stores a `/compact` message from the person and a reply from the agent, so the thread showed a command bubble and a sentence the person had not written or asked for.

- The thread view folds the pair into one full-width divider: `Compacted`, `Nothing to compact`, `Compacting…` while the run goes, or `Compaction did not finish` when it ended without a reply. The stored messages are unchanged, so nothing is migrated and the agent's history is as before.
- The fold is a `[compaction]` system note (`@aven/protocol/system-notes`) made on the client by `foldedCompactions`, drawn by `CompactionDivider`. A message is a compaction only when its whole text is `/compact`.
- A reply that is not the usual one (a Claude run's own output, an error) is kept below the divider, so nothing the agent said is hidden.
- `COMPACT_PROMPT`, `COMPACTED` and `NOTHING_TO_COMPACT` moved to `@aven/protocol/compaction` so the browser can read them without the agents package; `@aven/agents/compaction-agent` still exports them.
