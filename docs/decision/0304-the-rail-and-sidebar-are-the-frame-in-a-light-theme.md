# The rail and the sidebar are the frame in a light theme

Status: accepted. Corrects the shell colours of 0266, which the flattened shell no longer followed.

## Context

Decision 0266 gives every theme a sidebar of the page's colour. The shell of #319 paints the rail and the sidebar with `--chrome`, set in `app-shell.tsx` as the frame mixed 28% toward black. Measured across all 26 palettes, that left a light theme's sidebar at about 25-35% luminance beside a page at 76-100%: a mid-grey slab that looked like a dark overlay on a light app. In a dark theme the frame is already near black, so the same mix changed nothing a person could see.

## Decision

- `--chrome` is defined in `index.css`, not in the shell. In a light theme it is `var(--frame)`, the colour each palette already picked for the window around the page, which sits 3-12 points of luminance under the page. In a dark theme it stays `color-mix(in oklch, var(--frame), black 28%)`.
- The shell keeps `--sidebar: var(--chrome)` and the accent mixed from it. No palette block changes.

## Consequences

- Every light palette's sidebar now reads as a tint of its own page. The Aven and Mint default goes from a mid grey to the 87% frame under a 97% page.
- A new palette needs only `--frame`; it gets the right rail and sidebar in both modes.
