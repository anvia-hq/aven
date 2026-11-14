# 0285: The runtimes list is a card with load tiles and a trend

Status: accepted.

## Context

The runtimes settings page was a six-column table: runtime, status, version, load, last
seen and actions. On a normal settings width the actions column fell off the right edge,
the name shared one line with three badges, `last seen` wrapped over three lines, and
the CPU/MEM/DSK meters were too narrow to read. The list holds few runtimes, so each
one can take more room.

## Decision

- Each runtime is a card: name with version, how long ago it was seen and its sandbox
  count on one line, an Online/Offline pill, the This-computer/GitHub/Built-in/Update
  badges in their own row, and the same actions in a footer row.
- Load is four tiles: CPU, MEM and DSK each show the big percent, the meter, what is
  behind the number (cores, used of total), a sparkline and the move since the previous
  report; the fourth tile is the sandbox count.
- The trend is honest: it appears after two reports arrive, which in production is two
  polls of the runtimes list. Before that the tile says so.
- The old table is gone; the e2e selectors move from `table`/`row` to `list`/`listitem`.
- Proof lives in `.aven/proof/runtimes-cards/before.png` and `after.png`.

## Consequences

- Adding a load source means adding a tile, not a column.
- The trend needs no server change: it is built from the last twenty reports the page
  already fetched.
