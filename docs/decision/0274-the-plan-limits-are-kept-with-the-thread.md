# 0274: The plan limits are kept with the thread

Status: accepted. Refines 0251 and 0255, which kept the limits only for the run in memory.

## Context

The Limits card (5-hour and weekly windows of the Claude subscription) came from `limits` run events, which the control plane merged into a run's usage in memory only. A thread opened after a refresh, or after the run ended and the control plane held no run for it, had a snapshot built from the transcript alone, so the card was gone until the next run reported again.

## Decision

- **The latest limit per window is stored with the thread.** Table `thread_plan_limits` (`thread_id`, `window`, `status`, `percent`, `resets_at`), written when a `limits` event arrives and replaced per window. It goes away with the thread.
- **A snapshot carries what is stored.** The idle snapshot, and the one of a run that has only just begun, start from the stored limits; limits reported by the run in progress replace them per window.
- **A window that has reset is not shown.** A stored limit whose `resets_at` has passed is left out, since its percentage no longer says anything; the card is back with the next run's report.
- **A failure to store or read is no data.** It never fails a run or a snapshot.
- **It is the thread's, not the person's.** The limits are the subscription's, but the store is per thread, like the other things a thread keeps (its run times, its senders); a thread that has not run yet shows none.

## Consequences

- The card survives a refresh, navigation and a control-plane restart.
- No wire change: the snapshot's `usage.limits` is the field it already had, so no runner update is needed. A migration (0066) adds the table and only goes forward.
