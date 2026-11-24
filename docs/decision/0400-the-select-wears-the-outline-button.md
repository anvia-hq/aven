# The select wears the outline button

Status: accepted. Decided 2026-11-24. Records the select's own look, which had none; the theme card rail of 0398 and the mode row of 0224 keep their shape.

## Context

The vendored shadcn trigger was a 32 px bordered field (28 px with `size="sm"`), and a menu that
centred itself on the chosen row, zoomed in from 95% and took its width from the trigger. On
a short list the menu landed under the cursor; on a long one it opened at an offset that did
not line up with the field that opened it. Call sites patched around it: six of eighteen
triggers passed `size="sm"`, seven re-declared `w-auto min-w-(--anchor-width)`, three passed
`alignItemWithTrigger={false}`, and three stripped the border and the background to blend
into a toolbar, the header or a pill.

An earlier revision of this change made the trigger a filled field with no border at all:
32 px tall, `bg-foreground/10`. In a settings row it became the only control without an edge,
so it read as a tinted chip rather than something you could open, and in the dark palettes the
10% foreground over the page is barely a shade. The person put it next to the `Change photo`
button, which is a `Button variant="outline" size="sm"`, and asked for the select to look like
that. Its colours were left to us.

## Decision

- The trigger wears the outline button's recipe, token for token: `h-7` (44 px below `md`),
  `rounded-[min(var(--radius-md),12px)]`, `border border-border bg-background` in light and
  `dark:border-input dark:bg-input/30` over the page. Hover fills `bg-muted`
  (`dark:bg-input/50`) and the same fill stays while the menu is open (`aria-expanded`), so
  the trigger behaves like the button that opens a menu. Focus is the button's border plus
  `ring-ring/50`; invalid is `border-destructive` (`dark:border-destructive/50`). The label
  is `text-[0.8rem] font-medium`, the chevron 12 px in `text-muted-foreground`, and the field
  is as wide as its value (`w-fit`, bounded by `max-w-full`).
- The colours are the button's tokens and no new values. `--border` is a hair lighter than
  `--input` in light mode, and `Button`'s outline variant uses it, so the select does too; a
  palette change moves the button and every select together. The light border stays faint
  (about 1.2:1 against the page) exactly as the button's does: the label and the chevron
  carry the control, the edge only gives it a shape.
- The menu opens under the trigger, centred on it with a 4 px offset (`align="center"`,
  `alignItemWithTrigger={false}`), and flips above only when the space below cannot hold it.
  It is as wide as its widest row and never narrower than the trigger
  (`w-max min-w-(--anchor-width)`), up to `20rem` and at most `18rem` tall, so a long list
  scrolls. It is drawn with a 1 px `foreground/15` border and no shadow, and it fades rather
  than zooms. Rows are 30 px (44 px below `md`) with a 4 px radius, and the chosen row keeps
  `bg-accent`.
- `SelectTrigger` has no `size` prop. The eleven files that hold a select drop `size="sm"`,
  the content width overrides and the `alignItemWithTrigger` props they passed. The three
  places that want no edge — the task drawer's inline status and priority, the header's
  project chip and the runtime pill — keep stripping the border and the fill themselves.

## Consequences

- One trigger height everywhere, the same 28 px as `Button size="sm"`, so a select and a
  button sit level in a row and in a dialog footer. That is 4 px shorter than the 32 px
  default field it replaces, and the same as the six call sites that already asked for
  `size="sm"`.
- A select in a table cell or a dialog reads as an outlined control instead of a tinted one;
  where an outline button would be wrong (inside the task drawer's text lines, the header's
  chip, the pill), the call site says so with `border-0` or `border-transparent`.
- The menu is wider than its trigger when a row is longer, and Base UI nudges it back inside
  the viewport near an edge, so there it sits off-centre. Without a shadow the 1 px border is
  the whole separation from a popover-coloured surface.
- `alignItemWithTrigger` stays on `SelectContent` but defaults to `false`, and no call site
  passes it. Combobox, dropdown menu and popover are untouched.
