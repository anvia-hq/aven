# A pinned thread belongs to one person and stays above Today

Status: accepted. Built by decision 0359. It follows decision 0293 (thread recency) and the sidebar's thread list in `apps/platform/src/modules/threads/components/sidebar-threads.tsx`.

## What a person sees

The sidebar gains one section above Today when the signed-in person has pinned a thread:

```text
Pinned
  • Thread penting A
  • Thread penting B
Today
  • ...
Last 7 days
  • ...
Last 30 days
  • ...
```

A thread is pinned from its row's `⋯` menu, which today only offers Archive. The menu gains Pin, or Unpin when the thread is already pinned. The Pinned section is collapsible and remembers whether it is open, like Today and the other groups. Pinning a thread puts it at the top of the Pinned section. A thread's activity, a finished run, or a new message never moves it: the Pinned section is ordered by when each thread was pinned, not by `updated_at`. Unpinning returns the thread to the recency group its last activity puts it in, with no other change.

Only the person's own open threads can be pinned. The "Shared with workspace" list at the bottom of the sidebar is unchanged and offers no pin.

## Intent and why

The person asked for a way to keep important threads where they can find them. Today the sidebar orders every thread by `updated_at` inside Today, Last 7 days and Last 30 days, so a thread sinks as soon as someone else's thread is touched. Recency is still right for most threads; a pin is the exception the person chooses.

The pin is the person's own, not the thread's: a teammate opening the same thread (a workspace-shared one) does not see it or lose it. That is why the pin is not a column on `threads`.

## Goals

- A per-person pin that survives a new browser, a new machine and a sign-out.
- A Pinned section above Today, ordered by pin time, never reordered by activity.
- Pinning and unpinning leave `threads.updated_at`, `state` and every other thread field untouched.
- A thread's forks travel with it: pinning a parent shows its forks nested under it in Pinned, and they leave the recency groups with it.
- One migration, two routes, one condition in the archive sweep, and the sidebar.

## Non-goals

- Pinning a thread a teammate created (the workspace-shared list).
- Reordering pins by hand (dragging one pin above another).
- Pin state in the project page's thread list, the threads index page, Aven Desktop, the macOS client, the CLI or the bot thread tools.
- A pin count, a pin badge on the thread page, or a keyboard shortcut.
- Any change to the runtime wire (`@aven/protocol`): this is a browser-to-control-plane HTTP field only, so `WIRE_VERSION` does not move.

## Anti-goals

- A pin that reorders when the thread runs, so the thing a person pinned keeps moving.
- A pin stored only in the browser, which another device cannot see.
- A `pinned` column on `threads`, which would make one person's pin everyone's pin and would bump `updated_at` on every pin if written through the thread update.
- A second convention for per-person thread state: the repo already has `thread_mentions` for exactly this shape.

## Approaches

1. **A `thread_pins` table per person** (chosen). One row per `(thread_id, user_id)` with `pinned_at`; the thread list carries `pinnedAt` for the viewer; `PUT` and `DELETE /threads/:id/pin`. It matches `thread_mentions`, cascades with the thread and the user, and is readable from every client.
2. **A pinned-id array on `user_settings`.** One column, no new table, following `dismissed_notices`. Cheaper, but there is no foreign key or cascade, a concurrent pin from two devices is a read-modify-write on one row, and the pin is mixed into preferences that have nothing to do with it.
3. **`localStorage` only.** No backend at all. The pin is lost on another browser or device, and nothing else can read it, which contradicts "mine" as an account-level statement.

Option 1 costs one table and one migration, which this repo does routinely, and is the only option that keeps the pin attached to the account without inventing a new place for per-person thread state.

## Design

### Data

New table `thread_pins` in `packages/db/src/schema/thread-pins.ts`, imported as `@aven/db/schema/thread-pins` like every other table:

- `thread_id uuid not null`, references `threads.id`, `on delete cascade`.
- `user_id text not null`, references `users.id`, `on delete cascade`.
- `pinned_at timestamptz not null default now()`.
- Primary key `(thread_id, user_id)`, which is the lookup the thread query makes.
- No extra index: every read is by both key columns.

The migration is generated with `bun run db:generate` from `packages/db`; never hand-written.

### Control plane

`apps/control-plane/src/modules/threads/pins.ts` holds `threadPinsService`, beside `mentions.ts`:

- `pin(userId, threadId)` inserts `(threadId, userId)` with `onConflictDoNothing`, then reads the row back and returns `{ pinnedAt }`. Pinning an already pinned thread keeps its original `pinned_at`, so an idempotent call never reorders the section.
- `unpin(userId, threadId)` deletes the row and returns `{ pinnedAt: null }`. Unpinning a thread that is not pinned is not an error.

The thread view gains `pinnedAt` for a viewer. In `service.ts`, `columns` becomes `columnsFor(userId?)`: when a `userId` is given it adds a correlated subquery over `thread_pins` matching `(thread_id, user_id)`; when it is not (`get`, `byId`), `pinnedAt` is `null`. Every existing caller that has a person passes that person, so `list`, `readable`, `owned`, the `*ForPerson` variants, `create`, `update` and `drivable` all return the same shape. The platform receives an ISO string, like `createdAt`.

Routes in `apps/control-plane/src/modules/threads/router.ts`:

- `PUT /threads/:id/pin` -> `threadPinsService.pin(user.id, id)`, guard `{ thread: "own", params: threadParams }`.
- `DELETE /threads/:id/pin` -> `threadPinsService.unpin(user.id, id)`, same guard.

Both answers are `{ pinnedAt: string | null }`. The `own` guard already means a thread the person did not create, or one that does not exist, is a 404, so a shared thread cannot be pinned.

The archive sweep in `apps/control-plane/src/modules/threads/retention.ts` gains one condition: a thread with any `thread_pins` row is skipped. Only the creator can pin their own thread, so "any row" is the creator's pin. Unpinning deletes the row and the ordinary 30-day rule applies again at the next hourly sweep; no separate timestamp is needed.

### Platform

- `apps/platform/src/modules/threads/types.ts`: `Thread` gains `pinnedAt: string | null`.
- `apps/platform/src/modules/threads/hooks/use-threads.ts`: `setPinned(threadId, pinnedAt)`, beside `setMarkColor`.
- `apps/platform/src/modules/threads/hooks/use-pin-thread.ts`: optimistic like `use-rename-thread.ts`. Set the local value, call `PUT` or `DELETE /threads/:id/pin`, and on failure put the old value back and toast "Could not pin the thread" / "Could not unpin the thread". No success toast; the row moving is the feedback. No refresh is needed because no other field changed.
- `apps/platform/src/modules/threads/pinned-threads.ts`: pure `splitPinned(threads)` returning `{ pinned, pinnedIds }`. A thread is pinned when it or any ancestor is pinned. `pinned` holds each pinned family once, root first; families are ordered by the newest `pinnedAt` among their pinned members, so pinning any member raises the family and unpinning the root keeps the newest remaining pin. `pinnedIds` is every thread drawn in the section, forks included. A thread whose parent is not in the list is its own root, the same rule `recencyGroups` uses. Tested beside it.
- `sidebar-threads.tsx`: `const { pinned, pinnedIds } = splitPinned(threads)`; `recencyGroups(threads)` is still computed over the full open list, and each resulting group drops the ids in `pinnedIds`, so a pinned fork's activity still decides its parent's group (decision 0293). The Pinned section renders above the groups through the same row renderer. The current `RecencyGroupSection` becomes a generic `ThreadGroupSection` taking `id`, `label` and children, so Pinned uses `aven.sidebar-group.pinned` for its open state and looks like the other groups while reusing its animation and accessibility.
- `thread-actions-menu.tsx`: props gain `pinned` and `onTogglePin`; the dropdown gets a Pin or Unpin item with `PinIcon` above Archive. The row itself gets no pin icon: the section already says why it is there.

### Edge cases

- **Archiving a pinned thread.** The pin row stays. The thread is hidden while archived, as every sidebar row already is, and comes back to Pinned when the person reopens it. Archive does not silently unpin.
- **Deleting a thread or a user.** The cascade removes the pin.
- **A fork pinned on its own.** It appears alone in Pinned with its own forks; its parent stays in its recency group. Pinning the parent later brings the whole family together under the parent's pin.
- **A split pair with one pinned member.** `splitPinned` is not pair-aware: the pinned half moves to Pinned alone and its partner stays in its recency group, so the pair row disappears until the pin is removed. When both halves are pinned they pair again inside Pinned, exactly as they do in a recency group today, and their forks render under the pair row as they do there.
- **A pinned thread that finishes or fails.** Status dot and the attention rules are unchanged; only the row's position is fixed.
- **The person's list is empty of pins.** The Pinned section is not drawn at all, exactly like the "Shared with workspace" heading when there is nothing shared.
- **The sidebar in icon mode.** The section is inside the same `group-data-[collapsible=icon]:hidden` container as Today, so it hides with it.
- **Another tab or another device.** The pin appears on the next refresh of `GET /threads`; there is no live push, as with every other sidebar-only field.
- **The 30-day archive sweep.** `createThreadRetention` skips a thread that has a `thread_pins` row, so a pinned thread stays in the sidebar however long it is idle; decision 0293's sweep is amended rather than silently overridden. Unpinning removes the row and leaves an over-30-day thread eligible again, so the next hourly sweep archives it exactly as before. Because only the creator can pin their own thread, the row the sweep checks is in practice the creator's.

## Files

- `packages/db/src/schema/thread-pins.ts` and the generated migration.
- `apps/control-plane/src/modules/threads/pins.ts` and its test.
- `apps/control-plane/src/modules/threads/service.ts`, `router.ts`, `retention.ts`.
- `apps/platform/src/modules/threads/{types.ts,hooks/use-threads.ts,hooks/use-pin-thread.ts,pinned-threads.ts,components/sidebar-threads.tsx,components/thread-actions-menu.tsx,components/thread-group-section.tsx}` and their tests.
- `docs/decision/0359-a-thread-pin-belongs-to-one-person.md`, and the thread recency bullet in `docs/products/0007-system-reference.md`.

## Testing

- `pinned-threads.test.ts`: families split out with their forks, families ordered by the newest pin among their members, a fork's activity still places its parent's group when the fork is pinned, unpinned threads keep input order, a thread whose ancestor is pinned is not drawn twice, and split-pair halves move independently.
- `apps/control-plane/src/modules/threads/pins.test.ts` (Postgres, skipped without `DATABASE_URL`): a pin is visible to its person and not to a teammate who sees the same workspace-shared thread; pinning twice keeps `pinnedAt`; unpinning is idempotent; `updated_at` does not move. It follows the seeding of `mentions.test.ts`.
- `retention.test.ts` gains a case: an over-30-day open thread with a pin is left alone; removing the pin makes the next sweep archive it.
- Manual check in the running app: pin from the menu, confirm the thread moves above Today and stays while a new message arrives, unpin and confirm it returns to its recency group, reload and confirm the pin is still there.
- An e2e test is not required; add one only if it is cheap once the flow exists.

## Left to the builder

- Whether `pinnedAt` uses the correlated subquery above or a `left join` inside `list`; either is acceptable if `pinnedAt` is on every thread view.
- The exact extraction of the group section component and whether `RecencyGroupSection` is renamed or wrapped.
- The test helpers and fixtures for the Postgres test.
- Whether a small e2e is worth adding.
