# 0361. Archived threads wait in the sidebar, closed

Status: accepted. Adds to 0293 (thread recency) and 0118 (archiving stops a run and frees the sandbox).

## Context

Archiving a thread dropped it from the sidebar and the recent list, and that was the whole story: the only way back was the thread's own address and a message, which reopens it (the e2e case "sending to an archived thread puts it back in the sidebar"). A person who archived something by mistake, or wants to read it again, has to remember its URL. The list already carries every thread of the person's, archived ones included, sorted by `updated_at`, so nothing had to change on the wire.

## Decision

- **An Archived section sits under Last 30 days**, in the sidebar's own column, above Shared with workspace: the person's archived threads, newest first, with the count in its heading (`Archived (3)`).
- **It starts closed, and its rows are only drawn when it is open** (`lazy` on `components/sidebar-section.tsx`), so the sidebar looks exactly as it did before for anyone who does not open it, and a closed section costs no rows. The open state is kept per person in `aven.sidebar-group.archived`, beside the recency groups' own.
- **A row is the sidebar's row, with Restore where Archive was** (`components/thread-actions-menu.tsx`, `hooks/use-restore-thread.ts` sets `state: open` through `PATCH /threads/:id`). An archived row carries no status dot and cannot be dragged into a split, since a split pair is of threads that are open.
- **The recency groups are unchanged.** `RecencyGroupSection` became `SidebarSection`, which takes an id and a label instead of a `RecencyGroup`, so the groups and the archived list share one collapsible.

## Consequences

- The open list still drops an archived thread at once, and a message to one still brings it back; now there is also a way back without opening it.
- Restoring a thread puts it back in its recency group, where it is placed by its parent's latest change as before (0293). The section disappears when the last archived thread is restored.
- Only the person's own archived threads are listed. Shared threads another person archived are not drawn, as they were not before.
