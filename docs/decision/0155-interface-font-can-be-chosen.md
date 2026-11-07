# 0155: The interface font can be chosen

Status: accepted. Builds on 0153 (themes).

## Decision

- Settings, Profile, Appearance has an "Interface font" dropdown with System default, Inter, IBM Plex Sans, Source Sans 3 and Geist. It is kept on the device (`font` in local storage), like the theme.
- The choice sets `--app-font` on `<html>`; `--font-sans` reads it with the system font as fallback. Code keeps Geist Mono.
- The three Google fonts are loaded from the Google Fonts CDN when chosen (one `<link id="aven-font">`). The app sends no Content-Security-Policy, so this is allowed. Offline, the browser falls back to the system font.

## Consequences

- A new font is one entry in `SANS_FONTS` (`modules/theme/types.ts`) with its Google Fonts query.
- The fonts load from a third party, so their requests reach Google.
