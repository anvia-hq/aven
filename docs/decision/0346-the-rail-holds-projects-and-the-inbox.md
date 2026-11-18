# The rail holds Projects and the inbox

Status: accepted.

## Context

The rail held the Aven logo, Cockpit, the bot and a Machines icon, and the sidebar began with a New thread row and a Projects row. A new thread had no project until one was chosen, and its picker said "Choose a folder" or "Choose a repository".

## Decision

- The rail is the logo (threads), Projects, the inbox (`/cockpit/inbox`, replacing the Cockpit entry), the bot and Settings. Its icons are bare: the current one is marked by the bar at its left edge and the stronger color, with no container.
- The Machines icon and its hover list are gone; a machine's load stays in the sidebar footer and in Settings > Runtimes. The corner dot that showed a thread's machine online or offline is gone too.
- The sidebar's header has a New thread button, a primary circle, beside search. The New thread and Projects rows of the sidebar show on a phone only, where there is no rail.
- A new thread starts in a project: the one of the person's latest thread that fits the chosen computer, else the first that fits. The picker says "Add a project" only when none fits.
- The line between the rail and the sidebar, and the sidebar's own right edge, are removed; the panel's border, `foreground/12`, is the one line.

## Consequences

- The machines test of the hover list is deleted from `e2e/machines.spec.ts`.
- A person who wants a thread in no project cannot start one: threads always belong to a project (decision 0218).
