# 0188: The thread keeps who sent each message

Status: accepted. Refines decisions 0179 and 0187.

## Context

Decision 0179 records a teammate's message as `[driver: <name>] <text>` so the agent knows who is
speaking, and the creator's own message plain. That is the only record of the sender. Decision
0187 draws each message on the viewer's side by matching names against it, which fails for two
members who share a name, forgets a renamed member and cannot tell who sent a plain message
without knowing who created the thread.

## Decision

- The sender is kept beside the message, not in its text: a table `thread_message_senders`, one
  row per thread and message place, holding the user id, as `thread_run_times` keeps the time of an
  answer. A person's message, whether it starts a run or steers one, records its sender, the
  creator's included.
- A message carries an optional `senderId`, and so do the `run_start` and `steer` events that
  announce it, so a viewer is told as it happens and again by the thread's snapshot. It is
  optional, so the runner wire is unchanged: the id is left out of what is handed to the runner,
  and a message from before this, or one with no person behind it (a background process's end, a
  fork), has none.
- The `[driver: <name>]` marker stays in the text, for the agent. The thread uses the id to decide
  whose a message is, and falls back to the marker and the creator's name only for a message with
  no id.
- A member who is removed takes their rows with them, so their old messages are drawn by name.

## Consequences

- Two members with one name are told apart, and a message stays its sender's after a rename. The
  name shown is still the one written in the marker, or the creator's name for the creator, so a
  rename is not shown on old messages. Showing the member's current name and picture from the
  workspace list is later work.
- The place of a message is its index in the thread, as for a run's time. If a change ever moves
  messages, their rows must move with them, as the times must.
