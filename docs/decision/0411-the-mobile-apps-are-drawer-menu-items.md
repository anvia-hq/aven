# The mobile apps are menu items in the drawer

Status: accepted. Supersedes in part 0173 (the tab bar along the bottom edge; the app bar, the Close button and the safe-area frame stay). Decided 2026-11-29.

## Context

0173 put Threads, Bot and Cockpit in a tab bar fixed to the bottom edge of a phone. The bar took 3.5rem
from every screen, and the drawer already held the rest of the navigation as menu rows (New thread,
Projects, Automations), so a phone had two places to go from, in two different shapes, and the
drawer's rows were only there in the threads and projects sections.

## Decision

- The tab bar (`navigation/components/mobile-tab-bar.tsx`) is removed. Nothing is fixed to the
  bottom edge on a phone.
- `navigation/components/mobile-app-switcher.tsx` is the first thing in the drawer, under 48rem
  only: one menu row for each app of the desktop rail, in the rail's order and with its icons —
  Threads, Projects, Automations, Git Center, Cockpit, Bot. It shows in every section, so no section
  is a dead end. Settings stays in the drawer's footer, as the rail ends with it.
- The account select (`UserCard`) leaves the drawer's header for its footer, under Settings, as the
  rail ends with Settings and the account; its menu opens upward.
- `sidebar-tabs.tsx` (New thread, Projects, Automations, in two sections only) is removed, and so is
  `sections.ts`: the new thread button in the drawer's header already does what New thread did.
- `--mobile-tab-bar` is gone from `index.css` and `--mobile-chrome` is the app bar alone, so the
  screens that fill the height are 3.5rem taller. The scrolling screens no longer reserve room at
  their end.
- A wide screen is untouched: the rail, the sidebar and every height under `md` are as they were.

## Consequences

- Changing apps on a phone costs two taps again (the drawer's button, then the row) — the cost 0173
  paid to avoid — in exchange for the whole height of the screen and one navigation shape.
- `e2e/layout.spec.ts` opens the drawer to reach the `Apps` navigation instead of finding it fixed
  to the page.
