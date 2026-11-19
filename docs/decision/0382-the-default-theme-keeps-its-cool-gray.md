# The default theme keeps its cool gray

Status: accepted. Supersedes 0322, and with it restores the cool gray of 0292 and 0305.

## Context

0322 took the blue cast out of the default theme: every neutral in the base `:root` and `.dark` blocks became chroma 0 at hue 0. On a screen it does not hold up. At chroma 0 the steps between background, card, secondary, muted, accent and border collapse into one flat gray, so the surfaces stop separating from each other and the interface reads dull next to the status colors and the avatar, which kept their saturation. The 0.004 to 0.012 chroma the tokens carried was doing the work of telling the layers apart, and it was cheap: at hue 240 it reads as gray rather than as blue.

## Decision

- The default theme's neutral tokens go back to the chroma and hue they had before 0322 (hue 240, chroma between 0.003 and 0.012, each token its own lightness), in both the light and the dark block. The `apps/platform/src/index.css` tokens, the `theme` module's type and the wording in `docs/rules/0004-color-tokens.md` are reverted together.
- 0322 stays in `docs/decision/` as history, marked superseded, so the flat-gray attempt and its reason are still readable.
- Nothing else changes: the other palettes, the status and chart colors, the brand mark and the avatar keep what they had.

## Consequences

- Aven is a cool gray again in both modes, a nuance rather than a tint. Someone who wants a colorless interface picks another palette.
- Removing a cast from a neutral scale by taking the chroma to zero flattens the scale. Tune the chroma down to the point where the hue stops reading as a color instead, and look at the light and dark blocks on a screen before shipping.
