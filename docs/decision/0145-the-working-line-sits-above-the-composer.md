# The working line sits above the composer, not in the text

Status: accepted.

## Context

The working line (dots, a changing word and the time) was the last item of the scrolling conversation, made `sticky` at `bottom-48` with a solid background so that it would not bounce while the text above it grew (the scroll follows a frame behind). Two problems came of it: when the reader scrolled up, the sticky line stayed at that offset and its background cut off the text it floated over; and the room left for the composer was a fixed `pb-48` (decision 0017), so a taller composer (a pull request bar, attachments, a long message) covered the last lines. The word also changed width as it changed, which moved the time beside it.

## Decision

- **The line is part of the composer's overlay**, above the pull request bar and the prompt, outside the scrolling text. It stays where it is whatever the text does, and it cannot cut a line off. Its row (28px) is kept while nothing runs, so the composer does not move when a run starts or ends.
- **The conversation's bottom padding is measured**, not guessed: `useElementHeight` writes the overlay's height to `--composer-height` on the conversation's wrapper, and the messages' padding is that plus 1rem (12rem until it is known). This replaces the fixed `pb-48` of decision 0017.
- **The word has a fixed width** (12ch, the longest word and its ellipsis), so the time does not move as the word changes.

## Consequences

- Scrolled up, text passes under the overlay's fade, as it does under the composer, instead of being cut by a block of background.
- The bot chat still uses a fixed `pb-48`; it has no working line and a composer of a known height.
