# A NUL character is dropped from a message before it is stored

Status: accepted. Adds to [0021](0021-runs-go-through-anvia-durable.md).

## Context

A thread's messages are stored as `jsonb` (`agent_memory_messages.message`). Postgres cannot store a NUL character in `jsonb`: `unsupported Unicode escape sequence: \u0000 cannot be converted to text`. A tool that prints binary data (`cat` of a font, an image or a build artifact) puts one in its output, the insert for the whole run's messages fails ("Failed query: insert into agent_memory_messages ..."), and the run ends with that error. The messages are filed together, so the run's work and the answer are lost with the one character, and the next message to the thread tries again with the same content.

## Decision

- **The control plane's stores drop NUL characters from a message before it is written** (`NulFreeMemoryStore.append`, `without-nul.ts`): in every string of the message, and in object keys. Nothing else is changed. The text `\u0000` typed as six characters is kept, since it is not a NUL.
- It covers the threads' store and the bots' store, which share the class.
- The text is dropped rather than replaced: a NUL carries no meaning for the model, and a stand-in character would show up in the transcript as one.

## Consequences

- A run that reads a binary file keeps its work and answers. The tool output the thread stores is the output without those characters, so a later run sees the printable part only.
- The runner and the model still receive the output as the tool produced it during the run; only the stored copy is cleaned.
