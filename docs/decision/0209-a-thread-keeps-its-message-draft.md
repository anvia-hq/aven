# A thread keeps its message draft

Status: accepted.

## Context

The text and mentions typed in a thread's composer were held in memory only. A reload, or opening another thread and coming back, lost a half-written message.

## Decision

- The composer of a thread saves its text and mentions to `localStorage` as `aven.thread.<id>.draft`, and restores them when the thread opens.
- Sending clears the draft, and a message that fails to send is put back and saved again.
- Each thread has its own composer state, so a draft never moves to another thread.
- Signing out clears drafts with the rest of the user's saved state.
- The composer for a new thread, which has no id yet, and attached files are not saved.

## Consequences

- Drafts of deleted threads stay in `localStorage`.
- A draft is saved on every keystroke, as JSON of the text and its mentions.
