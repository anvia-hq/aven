# A toast is a one-line pill that opens its description on hover

Status: approved; implemented as decision 0362.

## Intent

Every notification in the app — bots, threads, settings, everywhere — is a toast in the
bottom-right corner. Today it is a 384 × 78 card: two 14px lines, a 1px border,
`rounded-2xl` on an 8px-radius app, and 16px of padding. It reads heavy for what is
mostly a one-line confirmation, and it is the only notification surface the app has.

The ask: make it compact and pleasant to look at, without losing the reason a person
needs when something fails.

## Goals

- Collapsed toast is one line: 32px tall in design units (28px at the default 87.5%
  interface scale), no border, radius 12, 13px title, 16px icon.
- The description is one hover (or keyboard focus) away, drawn as a compact second
  line under the title, like the error card in the approved mockup.
- One component change; all 93 `toast.add` call sites keep their copy and type.
- Works in all 25 palettes × light/dark: semantic tokens only.

## Non-goals

- No copy changes, no deduplication, no action buttons, no progress/loading toasts.
- No change to the stack limit (3), the 5-second timeout, or the corner.
- No new notification surface; the Base UI Toast stays the only one.

## Anti-goals

- A reason that is permanently invisible: an error that says what failed but never why.
- A hover-only affordance on a device that has no pointer.
- Per-module toast variants; the platform keeps one system.

## Constraints

- `packages/ui/src/toast.tsx` is the whole surface; `<Toaster>` is mounted once in
  `apps/platform/src/routes/__root.tsx`.
- Base UI Toast 1.9.0 owns the mechanics: `--toast-height`, `data-expanded`,
  `data-behind`, `data-limited`, swipe, and hover/focus pausing the timer.
- Repo rules: no comments in TS, no raw palette colors, no hand-edited generated files.
- The existing branch `toast-hides-its-description` already implements a pill; its
  decision doc claims number 0342, which `main` uses for another decision.

## Approaches

- **A — compact two-line card.** Shrink the current card to 320px, 12px padding, 13/12px
  text, radius 10, no border, 60px tall. Keeps every reason visible without interaction,
  but it is still a two-line card: the weight the ask is about stays.
- **B — one-line pill, description on hover.** 32px tall, width of its title up to 350,
  description revealed in place. Most compact and the branch already proves it. On its
  own it hides the reason on touch screens and until the pointer arrives.
- **C — two heights by content.** 32px without a description, 50px with one line of it.
  Keeps the reason visible, but a stack mixes heights and long error copy still grows the card.

**Picked: B's shape with C's expanded layout** — one line at rest, and on hover/focus the
description appears as C's top-aligned second line at 12px. It is the most compact shape,
it keeps the placement rules a person already knows, and it removes A's permanent bulk
and C's mixed-height stack.

## The design

Collapsed:

- Root: `rounded-xl` (12px), no border, `bg-popover`, `shadow-lg`, `text-popover-foreground`.
- Height 32px (design units) from `px-3 py-1` around a 24px close button; content gap 8px.
- Title: 13px/16px, medium, one line, `truncate`; the text block is centered while
  collapsed and top-aligned once a description opens, so the title does not move.
- Icon: 16px, vertically centered in the card in both states; `error` keeps
  `text-destructive`, `success` inherits the text color.
- Close: 24px, muted, vertically centered in the card in both states, always visible — it
  is the only pointer affordance on touch.
- Width: as wide as the title (`only:w-fit`), capped by the 350px viewport; a stack keeps
  one width so the peek and scale stay aligned.

Expanded on `group-hover` or `group-focus-within`:

- Content aligns to the top; the description sits under the title with 2px between them.
- Description: 12px/16px, `text-muted-foreground`, capped at four lines, revealed with
  `max-height` + `opacity` over 200ms `cubic-bezier(0.22,1,0.36,1)`; no blur.
- Height becomes `auto` while the pointer or focus is inside, so the card grows upward
  from its pinned bottom edge.
- The collapsed card contains the description (`contain: inline-size`) so the hidden text
  cannot widen it; on expansion the containment is released and the description widens the
  card up to the 350px cap (measured 206 → 231px at the default scale).
- `prefers-reduced-motion` drops the reveal transition.

Stack:

- Peek 6px and scale 94% / 88%; 12px and 10% were tuned for 78px cards and hide too much
  of a 32px one.
- Behind cards keep `opacity: 0` content; hovering the stack expands every card, as Base
  UI already does.

Touch:

- `@media (hover: none)` shows the description permanently, at the same 50px (design)
  height:
  compact where a pointer exists, complete where it does not.

Accessibility:

- The description stays clipped, not `display: none`, so screen readers still read it.
- `text-muted-foreground` is kept (4.6:1 on dark); no opacity is added.
- Focus ring and the close button's `aria-label` are unchanged.

## Left to the builder

- Verified in the real component at the default 87.5% interface scale: 28px at rest, 44px
  with a one-line description, 58px with two lines at the 350px cap; the collapsed stack
  peeks 5.25px per card (6 design px).
- Pick the exact easing for the width-less reveal and confirm the four-line clamp with the
  longest error copy ("The update did not finish").
- Rebase `toast-hides-its-description` onto `main` (icons moved to Solar since) and
  renumber its decision doc to 0362.
- Keep the proof screenshot under `.aven/proof/toast-pill/`.
