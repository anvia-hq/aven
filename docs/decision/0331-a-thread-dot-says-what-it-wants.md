# 0331: A thread's dot says what it wants, at the row's end

Status: accepted. Supersedes 0159 and 0205 in part: the dot moves from the row's start to its end, finished is blue, and a thread waiting on an answer asks for attention in red.

## Context

The sidebar had one dot, at the start of a thread's row, in one colour for two different things: a run that finished while the row was not open (0159), and a mention waiting for the person (0205). Neither could be told apart at a glance, and a third state had no sign at all: a thread whose agent asked a question and waits (`awaitingAnswer`) looked exactly like an idle one, so a person had to open the thread to learn it was blocked on them.

The row also carries a dot of its own on the project tile, green when the machine is online and grey when it is not. Two dots of the same shape with different meanings needed separate places, not the same one.

## Decision

- The sidebar draws one status dot at the end of a thread's row: 6 px, inline after the row's marks, so it sits at the right edge and moves left when the row's `⋯` appears on hover.
- Red (`--destructive`) when the thread wants the person: its last run failed (`lastError`, decision 0100), the agent waits on an answer (`awaitingAnswer`), or a mention of them waits (`useMentionedThreads`).
- Blue (`--info`) when its run finished while the row was not open (`useUnreadThreads`).
- Attention wins over finished. A split row takes the stronger state of its two threads: attention if either side wants it, else finished if either finished.
- The aria names stay apart — "Needs your attention" and "Finished, not opened yet" — and opening the thread clears both, as it did before (the unread atom, and `POST /threads/:id/mentions/seen`).
- The machine dot on the project tile is untouched: it says where the thread runs, not what the thread wants.
- `--info` joins the semantic tokens beside `--success` and `--destructive`.

## Consequences

- A question now shows before the person looks away: the thread list already carries `awaitingAnswer`, so no new request or column was needed.
- A failed run marks its thread red until the next run starts, which is when the control plane clears `last_error`; opening the thread does not clear it, since the failure is a state of the thread and not a notification the opening acknowledged.
- A row can show two dots with different meanings — one on the tile, one at the end. That is why they are not in the same place, and why the tile's dot keeps its ring against the orb.
- Themes that do not define `--info` inherit the base palette's blue, as they already do for `--success` and `--destructive`.
- The status is drawn from what the client knows (`apps/platform/src/modules/threads/thread-status.ts`), so a mention reaches the dot within the 15 s poll (0205) and a finished run at the next list refresh (0159).
