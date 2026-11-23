# A theme is picked from a card that shows it

Status: accepted. Supersedes the theme `Select` of [0155](0155-color-themes-with-light-and-dark.md); the mode select of [0224](0224-the-mode-is-a-select-that-can-follow-the-device-and-the-sidebar-is-quieter.md) only moves above it.

## Context

Theme was a dropdown of 26 names. A name says nothing about the palette, so picking one
was a guess confirmed after it had already repainted the app.

A palette is not one colour: `index.css` holds `:root[data-theme="<id>"]` and
`:root[data-theme="<id>"].dark`, two hand-written sets that differ in more than lightness.
Six palettes move their accent by more than 30° of hue between the modes (Ayu blue to amber,
Everforest blue to green, Monokai pink to lime), so a card painted at one mode cannot stand
for the other.

## Decision

- Settings > Appearance shows a horizontal rail of cards, one per palette. A card is `Aa`,
  two text bars, three swatches (`card`, `primary`, `effort`) and the palette's name, all
  painted in that palette's own tokens.
- A card carries `data-theme="<id>"` and `data-mode="<light|dark>"`. Every palette block in
  `index.css` also matches the subtree form, `[data-theme="<id>"]:not(:root)` and
  `[data-theme="<id>"][data-mode="dark"]:not(:root)`, so a preview reads the same values the
  app uses and no palette value is copied into TypeScript. `:not(:root)` leaves the
  document-root rules at their old specificity; `data-mode` is used instead of the `.dark`
  class so Tailwind's `dark:` variants do not leak into a preview.
- Aven, the default palette, sets no attribute at all, so its card paints by inheritance:
  it is the palette in the current mode, which is what the card should show.
- The card shows the palette at the mode the app is in now. `Mode` moves directly above the
  rail: the control that changes every card sits next to them.
- The cards are `ToggleGroup` items (`@aven/ui/toggle-group`), one per palette, with
  `aria-pressed` on the chosen one. `RadioGroupItem` cannot carry a card: it draws its own
  indicator and takes no children, and `aven/no-native-primitives` rules out a native radio.
  The group gives one-of-many selection, arrow keys and roving focus, and the rail still pages
  by 80% of its width with a prev/next pair (`useRailScroll`, which honours
  `prefers-reduced-motion`).

## Consequences

- Adding a palette now means adding its `:root[data-theme]` selectors in both forms; the
  subtree selector is what makes its card possible. The two edits are one line apart.
- A preview cannot show the other mode without splitting the card, which was rejected: the
  split read as two themes. Judging the other mode means switching Mode, one row away.
- The rail is 172px per card, about five cards visible at the settings width; the rest
  scroll.
