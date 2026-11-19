# A thread pin belongs to one person and spares its thread from the archive

Status: accepted. Amends the 30-day sweep of decision 0293; implements docs/products/0008-pinning-a-thread.md.

## Context

Decision 0293 orders every sidebar thread by `updated_at`, inside Today, Last 7 days and Last 30 days, and archives a thread that has been idle for 30 days. That is right for most threads, but it gives a person no way to keep one important thread where they can find it: the thread sinks as anyone touches their own threads, and after 30 idle days the sweep takes it away entirely.

A pin is a person's choice, not a property of the thread. A teammate opening the same workspace-shared thread has not pinned it and must not see or lose it.

Three approaches were weighed. A pinned-id array on `user_settings`, like `dismissed_notices`, needs no table but has no foreign key or cascade, mixes the pin into unrelated preferences, and makes a pin from two devices a read-modify-write on one row. `localStorage` alone needs no backend but loses the pin on the next browser or machine and cannot be read by anything else, which contradicts "mine" as an account-level statement. A `thread_pins` table fits the shape the repo already has for per-person thread state, `thread_mentions`: one table, one generated migration, a row per pair, cascades with the thread and the user, and a concurrent pin from two devices is two inserts rather than a lost update. It was chosen.

## Decision

- **`thread_pins` holds one row per `(thread_id, user_id)`.** `packages/db/src/schema/thread-pins.ts` defines `thread_id uuid` and `user_id text`, both `on delete cascade`, `pinned_at timestamptz not null default now()`, and the primary key `(thread_id, user_id)`, which is exactly the lookup the thread query makes. There is no extra index and no `threads.pinned_at` column: a column would make one person's pin everyone's pin, and writing it through the thread update would bump `updated_at`.
- **`pinnedAt` is the viewer's, and a pin never touches the thread.** `service.ts`'s `columns` becomes `columnsFor(userId?)`, which adds a correlated subquery over `thread_pins` for that person; without a viewer (`get`, `byId`) the field is `null`. Every caller that has a person passes one, so `list`, `readable`, `owned`, the `*ForPerson` variants, `create`, `update` and `drivable` return the same view and the platform receives an ISO string like `createdAt`. `threadPinsService.pin` inserts with `onConflictDoNothing` and reads the row back, so pinning twice keeps the original `pinned_at`; `unpin` deletes the row and answers null; neither writes `threads.updated_at`, `state` or any other thread field.
- **The Pinned section is ordered by the newest pin, and activity never reorders it.** `splitPinned` gathers each pinned family once, root first with its forks, and orders families by the newest `pinnedAt` among their members. A running thread, a finished run or a new message leaves the order alone. Unpinning returns the thread to the recency group its last activity puts it in, with nothing else changed. The section is drawn above Today through the same `ThreadGroupSection`, keyed `aven.sidebar-group.pinned`, and is absent when the person has no pins.
- **Recency is computed over the full open list and then filtered.** `sidebar-threads.tsx` computes `recencyGroups(threads)` exactly as before and drops the ids `splitPinned` reports as pinned, so a pinned fork's activity still decides its parent's group (decision 0293) even though neither is drawn in a recency group. The Pinned section contains every thread it draws, forks included, and no thread appears twice.
- **The archive sweep skips a pinned thread.** `createThreadRetention` adds one `notExists` over `thread_pins` matching `threads.id`, so a thread with any pin row is not stale and stays in the sidebar however long it is idle. Only the creator can pin their own thread, so in practice the row is the creator's. Unpinning deletes the row and leaves an over-30-day thread eligible again, and the next hourly sweep archives it as 0293 already says; no separate timestamp or grace period is needed.
- **`PUT` and `DELETE /threads/:id/pin` are the only new routes, both under the `own` guard.** They answer `{ pinnedAt: string | null }`. A workspace-shared thread the person did not create, or one that does not exist, is a 404, so the "Shared with workspace" list offers no pin.
- **Archiving a pinned thread does not unpin it.** The row stays; the thread is hidden while archived like any other row and returns to Pinned when it is reopened. Deleting the thread or the user cascades the pin away.

## Consequences

- A pin survives a new browser, a new machine and a sign-out, and every client that reads `GET /threads` gets it without a new wire message: there is no live push, the pin appears on the next refresh as every other sidebar-only field does.
- Pinned families travel together: pinning a parent brings its forks into Pinned and takes them out of the recency groups; pinning only a fork leaves the parent in its group. A split pair is not pair-aware, so a pinned half moves alone and the pair row disappears until the pin is removed.
- Removing a pin is the escape hatch from the sweep, and it is deliberate: an idle thread stays as long as the person keeps it pinned and becomes eligible the moment they let it go.

## Not done

- Pinning a thread someone else created or a workspace-shared thread; the shared list is unchanged.
- Pin state in the project page's thread list, the threads index page, Aven Desktop, the macOS client, the CLI or the bot thread tools.
- Reordering pins by hand, a pin count or badge, a keyboard shortcut, and any change to `@aven/protocol` (`WIRE_VERSION` does not move).
