# 0270: Text size is chosen for the interface, for threads and for bot chats

Status: accepted. Supersedes 0268 (a font of their own for threads and bot chats): the request was for the size of the text, not its typeface.

## Decision

- Settings, General, Appearance has three dropdowns: "Interface text size", "Thread text size" and "Bot chat text size", each Small (90%), Default, Large (112.5%) or Extra large (125%). The interface font dropdown of 0157 stays; the thread and bot chat font dropdowns of 0268 are gone.
- The interface size sets `font-size` on `<html>`, so every rem-based size in the app follows it.
- A thread's or bot chat's size is applied as `zoom` on the scrolling message list, on top of the interface size, so its text, spacing and code scale together. The composer, sidebar and the rest of the page keep the interface size.
- Each choice is kept on the device (`interface-text-size`, `thread-text-size`, `bot-text-size` in local storage). The `thread-font` and `bot-font` values of 0268 are no longer read.

## Consequences

- A new step is one entry in `TEXT_SIZES` (`modules/theme/types.ts`).
- `zoom` is used rather than a font-size, as the app's sizes are in rem and would not follow a parent's font-size.
