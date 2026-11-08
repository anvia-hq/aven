# A thread opens on its latest 100 messages

Status: accepted.

## Context

Opening a thread sent its whole transcript in the first event of `GET /threads/:id/events`, and the platform drew every message. A long thread, with screenshots and tool output in its history, made that event very large and the page slow, and no limit stopped it growing: the longer a thread lived, the worse it opened.

## Decision

- The snapshot, and `GET /threads/:id`, carry only the latest 100 messages (`MESSAGE_WINDOW`, `latestMessages` in `packages/protocol/src/message-window.ts`), starting at a person's message so a turn is not cut in the middle, and say how many earlier ones there are as `hidden`.
- `GET /threads/:id/messages?before=<hidden>` returns the page of up to 100 messages before that position, with its own `hidden`. The platform shows a "Show earlier messages (N)" button above the conversation that asks for the next page and puts it in front, until nothing is hidden. A new snapshot (a reconnect) starts again from the latest.
- The messages of the snapshot are numbered again from `m-0`, which the reducer relies on to name new messages after the last one; an earlier page is numbered `e-<index>`, so no two messages of a thread share an id.
- Only what is shown is cut. The agent's own history, a thread's summary for a continuation or a bot, and compaction still read the whole transcript. The `hidden` field is optional, so clients that do not know it show the latest 100 and stay correct.

## Consequences

- Opening a thread costs the same however long it has run, and older messages are one click away.
- Positions are indexes into an append-only transcript. After a compaction rewrites history, a page asked from a stale `hidden` may be off; reconnecting fixes it.
- The server still holds the whole transcript in memory for a running thread and loads it from the store to cut it: this bounds what is sent and drawn, not what is stored.
