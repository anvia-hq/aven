# The bot chat bubble takes whichever ink reads on its tint

Status: accepted.

## Context

A bot's colour tints the bubble of the person it talks to (`bubbleStyle` in `modules/bots/bubble-tint.ts`), and the ink on top of it came from `isLightTint`, which called a tint light when its relative luminance reached 0.35 and gave white ink to everything under it. Measured against the palette in `modules/bots/avatar.ts`, that put white on colours where dark text reads better: magenta 3.39:1, lilac 3.02:1, green 3.05:1, red 3.48:1, orange 2.80:1 and violet 4.14:1, all at or under the 4.5:1 that WCAG AA asks of body text, next to dark ink on the same tints at 4.27:1 to 5.87:1. Only `#0a5cff` reads better in white (5.13:1 against 3.45:1 for dark ink).

Reading was also cramped for a second and unrelated reason: 14px text with a tightened letter spacing leaves too little inside a bubble whose colour already competes with the glyphs, and the app's font setting decides whether a medium weight exists at all — on a machine whose `system-ui` is DejaVu Sans, 500 renders as 400, so the weight that was meant to help did nothing there.

## Decision

- The tint gets the ink with the better contrast, which in this palette means dark ink everywhere except `#0a5cff`: `LIGHT_TINT` moves from 0.35 to 0.18, and `avatar.test.ts` states which palette colour keeps white.
- The text in the bubble is 15px on a 22px line, and the bot's markdown answer is 15px on 24px, scoped to the bubble rather than `MARKDOWN_CLASS`, so thread messages keep their size.
- Letter spacing stays normal and the word space widens by `0.15em`, because the gaps between words were what made the line read as crowded; tightening the letters was the wrong lever.
- The tint itself, the palette, the avatar's own colour and the picker stay exactly as they are: this decision is about the ink and the type, not about what colour a bot has.

## Consequences

- Six of the twelve palette colours now show dark text instead of white, so a bubble looks different from before even when its colour is untouched. Contrast on the palette now runs from 4.27:1 (violet) to 11.36:1 (yellow).
- Mention chips follow the same ink (`bubbleInk` is shared), so `@Bot` on magenta, violet, lilac, green, red and orange turns dark as well. Their background stays the bot's colour.
- The medium weight is only visible when the app font ships a 500 — Inter, Geist and the other Google fonts in `modules/theme/types.ts` do; a system font without one falls back to 400, which the 15px size and the wider word space carry on their own.
- A bot colour set by hand still goes through the same luminance rule, so a colour outside the palette may land on white or dark ink by the same test rather than by its place in the palette.
