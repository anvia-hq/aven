# The Aven light theme is cool

Status: accepted. Corrects the light mode of 0292.

## Context

0292 made Aven the default and gave its dark mode a cool gray (hue 240), but kept Mint's light mode for the light one. Mint's light neutrals are warm and greenish (hue 80-90 for surfaces and borders, 160 for ink), so Aven read as cool in the dark and cream in the light.

## Decision

- The base `:root` neutrals, which are Aven's light mode, move to hue 240 with the lightness steps of Mint's: background, card, popover, secondary, muted, accent, frame, border, input, ring and the sidebar's own tokens. Chroma is 0.003-0.012, a little above the dark mode's, since a light surface needs more of it to show.
- Status and chart colors (`--destructive`, `--success`, `--graph-*`, `--meter`, `--effort`, `--code`) and the brand mark (0156) do not change.
- Mint stays as it was, warm, in its own `data-theme` block, and no other palette changes.
