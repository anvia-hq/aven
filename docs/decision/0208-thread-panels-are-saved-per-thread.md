# A thread's panels and their sizes are saved per thread

Status: accepted.

## Context

The toggles for the overview, desktop, diff, files, terminal and browser panels, and the sizes of the conversation and side panels, were saved under one key each in `localStorage`. Opening the terminal in one thread opened it in every thread, and resizing one resized all.

## Decision

- Each toggle is saved as `aven.thread.<id>.<panel>-open`.
- The conversation/side layout and the layout of the stacked side panels use `aven.thread.<id>.panels.<row|column>` and `aven.thread.<id>.side` as their layout ids, so `react-resizable-panels` saves them per thread.
- Signing out clears these keys with the rest of the user's saved state.
- The split view of two threads and the bot desktop toggle stay global.

## Consequences

- Every thread starts from the defaults (only the overview open) until its panels are set; the old global values are ignored.
- Keys of deleted threads stay in `localStorage`.
