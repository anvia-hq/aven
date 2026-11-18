# A toast hides its description until the pointer is on it

Status: accepted.

## Context

A toast appeared in two lines at 14px in a bordered, `rounded-2xl` card 76px tall, and the app makes 93 `toast.add` calls: 47 success, 31 error and 15 with no type. Most are a title alone ("Thread archived", "Photo saved"), a few carry a server message of one or two lines, and two echo the prompt of the person ("Your first prompt was not sent", "A message was not delivered"), so their length is not ours to bound. The card read heavy for the common case and the app has no other notification surface, so the change is one component: `packages/ui/src/toast.tsx`.

## Decision

- **No border, shadow only.** The card keeps `bg-popover` and `shadow-lg` and loses its 1px border, at `rounded-xl` (12px) with `px-3 py-1` (8 and 12px). The icon is 14px and the close is `size="icon-xs"` (24px), which sets the card's 32px height; the title is 13px in one line, cut with `truncate`.
- **The description is hidden until the card is hovered or focused.** `max-h-0`, `opacity-0` and `filter: blur(3px)` in the closed state; on `group-hover/toast` and `group-focus-within/toast` it goes to `max-h-20`, `opacity-100`, `filter: blur(0)` and `mt-0.5`. The open transition is 200ms `cubic-bezier(0.22,1,0.36,1)`, the close 150ms `ease-in`, and `motion-reduce` drops the transition so the text is simply there.
- **The reveal cannot unbounded-grow the stack.** `line-clamp-4` and `max-h-20` cap the description at four lines with an ellipsis; the card grows upward from its pinned bottom edge.
- **The card's height is released while the pointer is on it.** Base UI measures each toast into `--toast-height` and the root is `h-(--height)`; `hover:h-auto!` and `focus-within:h-auto!` beat the `data-expanded:h-(--toast-height)` rule (both are one class, so the order in the sheet would decide, and `data-expanded` comes later), which is what lets the revealed description fit instead of being clipped by `ToastContent`'s `overflow-hidden`.
- **A lone toast is as wide as its text.** The root is `w-full max-w-full only:w-fit` inside a viewport capped at 350px, so a stack keeps one width — its peek and scale offsets are tuned for it — while a single toast shrinks to its title. The description declares `contain: inline-size`, so the text it is hiding cannot widen the card; it wraps inside the width the title gave when it appears.

## Consequences

- The reason of an error is invisible until the pointer is on the card, and the card is dismissed by the provider's default timeout before that happens to someone who is not already looking at the corner. The error titles say what failed, not why.
- On a screen without hover the description is never seen; on a keyboard it appears once focus is inside the card (the close button). Screen readers still read it, because it is clipped rather than `display: none`.
- A toast alone in the corner is narrower than the stack's cards, so a message of two lines wraps inside the width of its title ("ANTHROPIC_API_KEY is / not set"); when a second toast arrives, the first one widens to the stack's width in one step.
- Hovering a toast expands the whole stack through Base UI's `data-expanded`, so the revealed card and the offset of the ones above it change in the same gesture.
