# The Aven neutrals lean slightly cool

Status: accepted. Amends [0366](0366-the-aven-theme-is-neutral-gray.md).

## Context

0366 made the default theme's neutrals pure gray (chroma 0). Next to the near-white cards a pure gray page reads as warm.

## Decision

- The default theme's neutrals, light and dark, and `--chrome` carry a faint tint: chroma 0.003 at hue 280, a faint violet gray. Their lightness steps stay.
- The tint stays well below the 0305 values (hue 240 and 205), so surfaces read as cool gray, not blue.
- `--code`, the inline code color, is a gray (0.35 in light, 0.85 in dark) instead of a yellow-green.
- Status and chart colors, the brand mark and the other palettes do not change.

## Consequences

- If it still reads warm or turns blue, the chroma and hue are the two numbers to move.
