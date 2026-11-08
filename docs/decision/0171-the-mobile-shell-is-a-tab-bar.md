# The mobile shell is a tab bar, with the page's own name over it

Status: accepted.

## Context

On a phone the shell was a 2.5rem bar saying "Aven", a menu button, and nothing else. Threads, Bot,
Cockpit and Center were a row of four links at the top of the sidebar, so changing apps meant
opening the drawer, finding the row and tapping it — two taps and a lost place for a move a phone
makes constantly. The drawer also had no close button of its own (the sheet hides the one
shadcn gives it), and its controls were 28px: below the 44px a finger needs.

What a phone wants is the shape every app on it has: the destinations along the bottom edge, in
reach of a thumb, with the way into everything else (the threads, Settings, the theme, the runners)
behind one button at the top.

## Decision

- `navigation/components/mobile-tab-bar.tsx` is a bar fixed to the bottom edge, under 48rem only:
  Threads, Bot, Cockpit and Center, each an icon over its name, one tap from any screen, the
  current one marked with `aria-current="page"` and a tinted circle behind its icon. It is still the
  `Apps` navigation the e2e specs look for.
- `navigation/components/mobile-app-bar.tsx` is the bar over the page: the menu button, the name of
  the app you are in (from `navigation/sections.ts`), and a search button that opens the command
  menu, which used to be only in the drawer. It sticks to the top while the page scrolls under it.
- The drawer keeps the user, the search, the threads and projects, the runners, Settings and the
  theme, and gains a Close button in its header. The row of app links is gone from it.
- `index.css` measures the frame as `--mobile-app-bar`, `--mobile-tab-bar` (which adds
  `env(safe-area-inset-bottom)`, so a home indicator never sits on a tab) and `--mobile-chrome`.
  Screens that fill the height — a thread, a bot's chat, the new-thread page — subtract
  `--mobile-chrome`; screens that scroll make room for the tab bar at their end
  (`app-shell.tsx`'s `pb-(--mobile-tab-bar)`).
- A phone gets a 9px-taller thread header and 32px panel buttons in place of 28px, and the five
  panel buttons fold into one Panels menu beside the title, since five buttons and a title do not
  share 390px. The composer's attach, send and stop, the drawer's search and close, the cockpit's
  Open/Done switch and its column buttons grow to 36px.
- The Threads tab opens the new-thread page, which on a phone now lists every open thread rather
  than the three the sidebar shows beside it on a wide screen.

## Consequences

- Changing apps on a phone is one tap and never costs the screen you are on, and the tab bar shows
  where you are.
- A thread's conversation, its composer and a bot's chat are 3.5rem shorter on a phone, which is
  the room the tab bar takes. The Panels menu is the price of a readable title at that width.
- The frame is measured in CSS, not in JavaScript: no resize listener decides where the bars go,
  and the safe area is the phone's own.
- `e2e/layout.spec.ts` keeps a phone in the shell: the tabs are there and at least 44px, one tap
  reaches Bot and Cockpit, and the drawer opens over the page and closes with its own button.
