# The Aven theme is neutral gray

Status: accepted. Supersedes the hue 240 and 205 neutrals of [0305](0305-the-aven-light-theme-is-cool.md).

## Context

0305 gave Aven's light mode a cool tint (hue 240) and its dark mode a blue-green one (hue 205). Next to the near-white page the tint read as a wash on every surface, and the sidebar and the rail, which are painted with `--chrome` (0304), looked like the page rather than a frame around it.

## Decision

- The default theme's neutrals, `:root` for light and `.dark`, have zero chroma: background, foreground, card, popover, primary, secondary, muted, accent, frame, border, input, ring and the sidebar's own tokens. Their lightness steps stay.
- The light background is `oklch(0.92 0 0)`, a clear gray under near-white cards, and the dark one is `oklch(0.22 0 0)`.
- `--chrome` is its own value in the default theme, a little below the page (`oklch(0.9 0 0)` and `oklch(0.2 0 0)`), instead of a mix of `--frame`. The other palettes keep the frame-derived one. The rail is a further 6% darker than the sidebar.
- Status and chart colors, `--code` and the brand mark do not change, and no other palette changes.
- The root font size is `100%` of the browser's, times `--interface-scale`, instead of `87.5%`.

## Consequences

- A person who sets a larger browser font gets larger type, as with any page that does not pin it. Sizes written in `px` stay put, so a layout tuned at 14px may need its spacing looked at.
- Decision 0305's hue steps no longer apply to the default theme; Mint is unchanged.
