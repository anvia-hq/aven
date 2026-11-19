# A toast is a pill that opens its description

Status: accepted.

## Context

Every notification in the app is a toast in the bottom-right corner, from one system: Base UI Toast 1.9, wrapped in `packages/ui/src/toast.tsx` and mounted once in `apps/platform/src/routes/__root.tsx`. The app makes 93 `toast.add` calls: 48 success, 32 error and 15 with no type. Most confirm a save in one line; a few carry the reason a request failed, and two echo the person's own prompt.

The card was `rounded-2xl` (16 design px) with a 1px border, `p-4`, and a 14px title above a 14px description. In the design units the app's Tailwind uses it was 384 × 78; at the default interface scale (87.5%) it was 336 × 65. Doubling the height for every confirmation read heavy, and the border drew more attention than the message.

## Decision

- **One line at rest.** The root is `rounded-xl` (12 design px) with no border, `bg-popover` and `shadow-lg`. `px-3 py-1` around a `size="icon-xs"` close makes a 32px pill (28px at the default scale). The title is `0.8125rem`/`1rem` medium and truncates; the type icon is 16 design px. The icon and the close stay inline at the right and are centered vertically in the card in both states.
- **The description opens upward.** It is `max-h-0`, `opacity-0`, `line-clamp-4` and contained (`contain: inline-size`) while closed. On `data-expanded` — hover anywhere on the toast, or focus inside it — it takes `max-h-16` and `opacity-1` with a 2px gap over 200ms `cubic-bezier(0.22,1,0.36,1)`, and the containment is released so the card can widen to fit it (measured 206 → 231px at the default scale), up to the 350px viewport. The root releases its measured height while the pointer or focus is inside, so the card grows from its pinned bottom edge.
- **A title-only toast never grows.** The padding and alignment change is guarded by `:has([data-slot=toast-description])`; Base UI renders the description only when the toast carries one.
- **Touch shows the description at rest.** `@media (hover: none)` reveals it permanently; without a pointer there is no gesture that would.
- **The stack tightens.** `--peek` is `0.375rem` (6 design px) and `--scale` loses 6% per card (94% then 88%); 12px and 10% were tuned for 78px cards and hid most of a 28px one.
- **Reduced motion** drops the reveal transition; the text is simply there.

## Consequences

- The reason of an error is invisible until the pointer arrives or focus enters the card, and the provider's 5-second timeout may dismiss it first. Error titles say what failed, not why. This was accepted on the earlier unmerged branch; the alternative, a taller card for errors, was rejected because it mixes heights in one stack.
- A touch screen always shows the reason, so its cards stay at the expanded height.
- When the description is wider than the title, the card widens on hover (206 → 231px at the default scale). Width has no transition, so it steps once while the height eases.
- In the light palette the card separates from the page only by `shadow-lg`; there is no border. The 6px peek of a stack is therefore subtle in light mode.
- The viewport cap is absolute (`max-w-[350px]`), so the interface scale changes the card's height and type but not its maximum width.
