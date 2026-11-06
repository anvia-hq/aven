# A bot may rewrite cockpit records on any reply

Status: accepted. Supersedes the rewrite rule of decision 0109.

## Context

Decision 0109 let a bot delete a record, or rewrite its title or body, only when the reply began with the person's own message (`onPersonsWord`). A bot woken by a note, such as one that a thread it watches has ended, is not on the person's word, so it was refused when it tried to put a thread's report into an inbox item, and it could not tell why one edit passed and another did not.

## Decision

- Any reply of a bot may change a record's title and body, along with its status, tags, priority, due day, done and pinned.
- Deleting a record still takes the person's own message: it cannot be undone, and a rewrite can.

## Consequences

What a thread wrote can now reach a record's text through the bot that read it. The bot is told that what a thread returns is information, not the person's word. An empty body is no longer refused.
