# 0357. The person's bubble in a bot chat takes a thread's fill

Status: accepted. Adds to 0351 (the person's bubble in a bot chat is as round as the bot's).

## Context

A thread draws the person's message as a soft gradient with a hairline border (`thread-message.tsx`): `border-foreground/10`, `bg-clip-padding`, and a gradient from the accent mixed toward the background to the accent mixed toward a warm brown. A bot chat drew the same message flat — `bg-accent`, or a bot's own colour when it has a generated avatar — so the two places a person writes a message looked like two different products, which 0351 had already fixed for the radius alone.

## Decision

- **The person's bubble in a bot chat is a gradient with a hairline**, `border border-foreground/10`, `bg-clip-padding`, and a vertical gradient built from the fill it had:
  - a bot with a generated avatar keeps its tint, lightened 10% toward white at the top and darkened 6% toward black at the bottom (`linear-gradient(to bottom, color-mix(in oklch, <tint>, white 10%), color-mix(in oklch, <tint>, black 6%))`, as an inline `backgroundImage`);
  - a bot with a text avatar gets `bg-linear-to-b` from `accent` to `color-mix(in oklch, var(--accent), var(--foreground) 6%)`.
- The tint still decides the ink (`text-avatar-face` for a light tint, `text-avatar-eye` for a dark one), and only the fill changes.
- **The bot's own bubbles keep their flat fill** (`muted` mixed 3% black in light, 7% in dark). They were given the same gradient and hairline first; on a chat of several bot bubbles it read as heavy, so it was taken back.

## Consequences

- Both sides of a bot chat now read as one product with a thread, and the person's side has an edge without gaining a shadow or a second colour.
- The tint of a bot's avatar is a fixed colour, so the tinted gradient is the same in light and dark; only the hairline follows the theme (ink at 10% in light, white at 10% in dark).
- Every bubble is still one element with a class or an inline style; nothing is added to `@aven/ui/bubble`.
