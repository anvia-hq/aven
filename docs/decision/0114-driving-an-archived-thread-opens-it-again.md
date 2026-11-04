# Driving an archived thread opens it again

Status: accepted. Extends 0084 (a thread is its creator's) and 0094 (a deleted project's threads stay archived).

## Context

Archiving sets a thread's `state` to `archived`, which drops it from the sidebar and the recent list. Nothing set it back: a person who sent a message to an archived thread, from its page or a link, got a working thread that never returned to their list, and the sidebar only lists `open` ones.

## Decision

- **A thread its creator drives is open.** Once the run is accepted, `threadsService.reopen` sets an archived (or snoozed) thread to `open`. That covers a message (`send`, also when it steers a working agent), the answer to a question and Compact, all in `threads/messages.ts`. A message that is refused leaves it as it was, and so does one that fails to start: 0088 archives a thread whose first message could not be sent, and it stays archived.
- **A deleted project's thread stays archived** (0094): those paths already refuse before anything starts, so nothing reopens it.
- **A bot's note does not reopen a thread.** A note may not continue an archived thread (0101); only the person's own word does, and that is a message like any other.
- **The platform asks for the list at once** after a message or an answer to a thread that was not open (`use-thread.ts`), so the sidebar does not wait for the next poll.

## Consequences

- To keep a thread archived, do not send to it; archiving it again is the same button as before.
