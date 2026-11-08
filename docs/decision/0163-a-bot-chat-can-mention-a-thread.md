# A bot chat can mention a thread

Status: accepted. Builds on 0063 (mentioning a bot), 0088 (a bot's tools for the person's threads).

## Context

To ask a bot about a thread the person had to describe it, and the bot had to find it with `list_threads`, guessing among threads with similar titles.

## Decision

- **`@` in a bot's composer also offers the person's own threads** (up to 8 that match what is typed, newest first), beside the other bots in the main bot's chat and alone in any other bot's chat. A picked thread is a chip in the composer, as a bot is.
- **A mention goes out as text, `@[title](thread:<id>)`**: the title has no brackets, parentheses or line breaks and is at most 60 characters, the id is the thread's (`threadMentionText`, `mentions.ts`). Nothing else changes on the wire or in the store: it is part of the message's text.
- **The chat draws it as a chip that opens the thread** (`splitMentions`, `thread-mention-chip.tsx`), found by the pattern in the text, so a message keeps its chip after a reload and needs no lookup. Something that only looks like one (an id that is not a UUID, a broken link) stays text.
- **The bot is told what it means** (the `<threads>` section of its instructions): the id is the thread's, to be looked at with `get_thread` before answering, and a mention is never a request to start, continue, stop or archive it. Those still need the person's own words (0088).

## Consequences

- A thread of another member of the workspace is not offered (`useThreads().threads` is the person's own), and `get_thread` refuses what is not the person's anyway.
- A thread renamed after it was mentioned keeps its old title in the chip; the id is what the bot uses.
- The menu now opens in every bot's chat, so `@` with nothing to match says "No bot or thread matches" where it used to open nothing.
