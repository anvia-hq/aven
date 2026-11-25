# Rail and sidebar are one surface

Status: accepted. Corrects 0304 (the rail and the sidebar are the frame in a light theme).

## Context

0304 painted the rail and the sidebar as the frame around the page: the rail carried `chrome` darkened 1.5% in light mode and 6% in dark, the sidebar carried `chrome` full. On a light theme that left a visible seam between the two left columns — the rail a shade darker than the sidebar beside it.

## Decision

- The rail uses `bg-(--chrome)`, exactly the sidebar's surface, in both modes. The `color-mix` darkening in `app-shell.tsx` is removed.
- 0266 still holds (sidebar is the page's colour through `--chrome`); 0304 holds in part (rail and sidebar stay the frame, but no longer two tones of it).

## Consequences

- No seam between rail and thread list in any theme or mode.
- A future separation of rail and sidebar wants a new token, not a re-darkening inline.
