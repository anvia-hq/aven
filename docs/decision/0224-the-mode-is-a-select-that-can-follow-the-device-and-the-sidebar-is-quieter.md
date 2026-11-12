# The mode is a select that can follow the device, and the sidebar is quieter

Status: accepted. Supersedes the "Dark mode" switch and the toggle in the shell of 0155, and the time at the end of a thread's row in the sidebar (0215).

## Context

Three things in the sidebar and Settings did less than they should:

- A thread's row ended with when it last changed ("5m", "2h"). Every row carried it, and it moved the title's room around: the three-dots button of 0215 took its place on hover. The list of threads has it already.
- The mode was a two-state switch in Settings and a toggle in the narrow rail and the phone's footer. Neither could say "whichever this device is set to", which people expect of an app that is open all day.
- The stack of machines in the footer was meant to fan out on hover. It did not move: its transition named `transform`, and Tailwind 4 sets `translate` and `scale` as properties of their own, which a transition on `transform` does not cover. The cards jumped from one place to the other. They also had almost no shadow, so the cards behind the first did not read as cards.

## Decision

- **A thread's row in the sidebar shows no time.** The padding that held its place goes, and the three-dots button sits in the room the base menu button already leaves for an action. A pair and a shared thread have no time either.
- **The mode is light, dark or system, chosen in Settings > Appearance with a select** (`ModePicker`). System follows the device's color scheme and changes with it, without a reload (`useTheme` listens to `prefers-color-scheme`, and `resolvedTheme` is what the editor and the terminal read). Dark stays the default. What a person already saved, `light` or `dark`, is still read as it was. The script in `index.html` that sets the class before first paint knows `system` too.
- **There is no theme toggle in the shell**, on the rail or in the phone's footer. The mode is a setting, not a control for every screen.
- **The stack of machines moves.** Its cards transition `translate`, `scale` and `opacity`, with the strong ease-out of `--ease-out-strong` (`cubic-bezier(0.23, 1, 0.32, 1)` in `index.css`, which the built-in `ease-out` is too weak to stand in for) over 200ms. Each card behind the first starts 30ms after the one above, up to three, so the fan opens from the front and ends inside 300ms; closing has no delay. Reduced motion keeps the fade and drops the movement and the delay. A card's shadow is `shadow-sm`, and a larger one lies under it as a pseudo-element whose opacity is what animates, so the shadow never repaints while it moves.

## Consequences

- The relative time is still in the list of threads (`thread-list.tsx`), and `shortTimeAgo` stays for the cockpit's lists.
- `e2e/machine-monitor.spec.ts` samples the cards frame by frame while the stack opens and fails if they jump, which is how the first version of this went unnoticed. Playwright runs with reduced motion, so that test turns it off for itself.
- A person who relied on the toggle in the rail has one more step to the mode: Settings, Appearance.
