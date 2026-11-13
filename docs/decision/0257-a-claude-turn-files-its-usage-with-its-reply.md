# A Claude turn files its usage with its reply

Status: accepted

## Context

A thread's token totals and context size are read back from the stored conversation, from the usage metadata on each assistant message (`usageFromHistory`). The default agent gets that metadata from the model library. The Claude backend streamed usage to the page as live events only, and filed assistant messages with no metadata, so after a reload or a navigation the Context and Usage panels were empty.

## Decision

`ClaudeTurn` keeps the usage and context size of each `result` and stamps them, in the library's generation-metadata shape, on the last assistant message it files for the turn. Nothing changes on the wire or in the database schema.

## Consequences

- Claude threads show their totals and context after a reload, from the next reply on.
- Threads filed before this change stay empty until their next reply.
- The provider and model id in the metadata are placeholders; only the usage and context window are read back.
