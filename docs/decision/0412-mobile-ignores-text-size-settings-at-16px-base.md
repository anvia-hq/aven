# Mobile ignores text size settings and keeps a 16px base

Status: accepted. Supersedes in part [0270](0270-text-size-is-chosen-for-the-interface-threads-and-bot-chats.md) and refines [0366](0366-the-aven-theme-is-neutral-gray.md). Decided 2026-11-29.

## Context

0270 added Interface, Thread and Bot chat text size settings stored in localStorage, applying `--interface-scale` to `html` and `zoom` to thread and bot message lists. On phones (below `48rem`), shrinking the root below `16px` fights mobile readability and iOS focus behavior, while scaling up cramps narrow layouts and double-scales zoomed chat lists.

## Decision

- Below `48rem`, `html` sets `font-size: 16px` and ignores `--interface-scale`. From `48rem` up, `html` keeps `font-size: calc(100% * var(--interface-scale, 1))`.
- `useTextSize` ignores the stored scale below `48rem` (`(min-width: 48rem)`), returning no `zoom` style on mobile while leaving the stored values untouched.
- Settings > General hides the Interface, Thread and Bot chat text size rows below `48rem` so phones do not show controls that have no effect.

## Consequences

- A phone always renders at a `16px` root base with unzoomed thread and bot conversations, regardless of any saved desktop text size settings.
- Resizing a desktop browser below `48rem` and back restores the saved settings without losing them.
