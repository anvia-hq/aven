# The background tasks card leads with what is running

Status: accepted.

## Context

The card said every process the same way: a status mark, the command, and a sentence under it
("Stopped · 5 minutes ago", "Exited with code 1 · 12 minutes ago"). Running ones came first, but a
person still read a sentence per row to find which process was alive, and up to five ended ones
took as much of the column as the live one. In the 288px column of the overview panel that was
most of the card.

## Decision

- A process is one line: its status mark, its command in mono, and a chip saying what became of it
  — `6m` in the success colour while it runs, `Exit 1` in the destructive colour, `Done` or
  `Stopped` in muted (`background-process.tsx`).
- What is running stays above; everything that ended folds behind an `Ended (n)` disclosure, open
  while nothing is running and otherwise as the person left it, with a `n running` count in the
  card's header (`background-tasks-card.tsx`, the `aside` slot of `overview-card.tsx`).
- Stop and Fix keep their place at the end of the row, beside the chip: the words are short ("Fix"
  is the face of "Ask agent to fix", whose full wording stays in its label and its tooltip), so a
  row still holds one line.
- A process's sentence — how long it ran, when it ended, why it failed — lives in the row's
  tooltip, where it costs no room.

## Consequences

- The card stays short however long a run has been going, and a process that stopped or failed is
  one click away instead of in the way.
- The chip is the only place a state is said, so its vocabulary carries the meaning: `Done`,
  `Stopped`, `Exit n`, and an elapsed time for a live one. A process running longer than an hour
  shows `1h` rather than a precise figure, and the tooltip has the rest.
- A row with an action has less room for its command than a row without one, since Stop and Fix
  take their width from the command and not from a corner of it.
