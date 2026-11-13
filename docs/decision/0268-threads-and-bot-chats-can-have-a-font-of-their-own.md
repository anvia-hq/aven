# 0268: Threads and bot chats can have a font of their own

Status: accepted. Builds on 0157 (the interface font).

## Decision

- Settings, General, Appearance has two more dropdowns beside "Interface font": "Thread font" (an agent's conversation in a thread) and "Bot chat font" (the conversation with a bot). Each lists the same fonts as the interface font plus "Same as interface font", the default.
- Each choice is kept on the device (`thread-font`, `bot-font` in local storage), like the interface font.
- A choice is applied by setting `--app-font` and `--heading-font` on the scrolling message list of that view, so everything inside follows it and code keeps Geist Mono. The Google font is loaded with its own `<link id="aven-font-thread">` or `aven-font-bot` only while it is chosen.
- The composer, the sidebar and the rest of the page keep the interface font.

## Consequences

- A new font is still one entry in `SANS_FONTS`; all three dropdowns pick it up.
- A color theme's heading face still wins over the chosen font for headings (0257).
