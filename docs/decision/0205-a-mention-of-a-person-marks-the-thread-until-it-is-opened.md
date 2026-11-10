# A mention of a person marks the thread until it is opened

Status: accepted.

## Context

In a multiplayer thread a person can mention a teammate (`@[Name](user:id)`). The teammate had no sign of it: the sidebar's unread dot (0178) only says that a run finished, and the thread list carries nothing about messages.

## Decision

- The control plane keeps a mention for the one mentioned, in `thread_mentions` (thread, person, time; one row for a pair, written again when mentioned again), when a message is sent. The author is left out and so is anyone who is not a user.
- `GET /threads/mentioned` answers the ids of the threads in the workspace, that the person can see, with a mention waiting. `POST /threads/:id/mentions/seen` forgets it. This is a separate call, not a field of the thread list, since the list's columns do not depend on who asks.
- The sidebar asks every 15 seconds while the tab is shown, and when the window gets focus. A thread with a mention shows the same dot as an unread one, with its own label, until it is open; opening it (or the other side of a split) calls `seen`.
- A thread that is new in the answer plays one soft note, quieter than the finished chime, even when the tab is in front, but never for the thread that is open, and not for what was already waiting at the first look. It follows the sound preference, now named Sounds.

## Consequences

- A mention shows up within 15 seconds, not at once, since there is no push channel for the list; a push would be a later change.
- The server keeps the mention across reloads and devices, and a person who never opens the thread keeps the dot.
- A message that fails after it was recorded (for instance a conflict) still leaves its mention.
