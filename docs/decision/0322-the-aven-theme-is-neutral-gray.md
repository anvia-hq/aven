# The Aven theme is neutral gray

Status: superseded by 0382 (the default theme keeps its cool gray). Was: accepted, superseding the hue of 0292 and 0305.

## Context

0292 made Aven the default and painted its dark surfaces a cool gray (hue 240, chroma 0.006). 0305 moved the light surfaces to the same hue so the light mode would stop reading as Mint's cream. Hue 240 is still a blue cast: every neutral, from the page to the borders and the ink, leans cool.

## Decision

- The default theme, the base `:root` and `.dark` blocks, drops that cast. Every neutral token is chroma 0 at hue 0: background, foreground, card, popover, primary and their foregrounds, secondary, muted, accent, code, frame, border, input, ring, and the sidebar's own tokens. Each keeps the lightness it had, so the steps between them stay as they were.
- Status and chart colors (`--destructive`, `--success`, `--meter`, `--meter-low`, `--graph-*`, `--effort`) stay colored, and so do the brand mark (0156) and the avatar face. Those are not surfaces.
- Mint stays warm and green in its own `data-theme` block, and no other palette changes.

## Consequences

- Aven reads as gray in both modes, not blue and not warm. A person who wants the cool or the warm look picks another palette.
- A new neutral in the default theme is chroma 0 as well, or it brings the cast back.
