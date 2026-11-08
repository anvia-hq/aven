# The working line sits under the last message, not in the composer

Status: accepted.

## Context

The "Working…" line (the dots, the rotating word and the elapsed time) lived in the composer, beside the project. The person found it far from the reply it describes. Moving it into the conversation risked the line jumping while the reply streamed in: a wrapped line grows the content, and the page's auto-scroll then caught up a frame late, so the line painted a few pixels off the end of the list for one frame.

## Decision

- `WorkingIndicator` is the last item of the message list (`thread-messages.tsx`), after queued messages and before any error, so it sits directly under the last streamed line. The composer no longer renders it. `startedAt` is passed to the message list for the timer.
- The auto-scroll in `use-scroll-to-bottom.ts` scrolls to the bottom inside the resize observer, not in a later animation frame. The observer runs after layout and before paint, so a frame that grows the content is never painted at its old scroll position.

## Consequences

- The line moves down only as lines are added below the reply, and keeps the same gap under the last line, with no one-frame flash. The e2e spec `working-under-response.spec.ts` checks this by sampling every painted state: the list is at its end and the gap is the same in all of them.
- Auto-scroll now runs synchronously on every resize of the message list, not once per frame. This applies to every message list that uses the hook, not only the thread page.
- The composer has more room, since the line no longer sits beside the project.
