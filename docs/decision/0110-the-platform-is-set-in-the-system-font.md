# The platform is set in the system font

Status: accepted. Supersedes the sans-serif part of decision 0099 (Mona Sans); code stays in Geist Mono.

## Context

Mona Sans read warmer than Geist, but the person wants the platform's text to look like the operating system's own: the font each machine already draws its menus and windows in.

## Decision

- **Sans-serif text is the system font**, with `--font-sans` set in `apps/platform/src/index.css` to `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`. Nothing is downloaded: each system draws its own.
- `@fontsource-variable/mona-sans` is removed. Geist Mono stays (`--font-mono`), bundled from `@fontsource-variable/geist-mono`.

## Consequences

- Text differs by system: San Francisco on macOS and iOS, Segoe UI on Windows, Roboto on Android and most Linux desktops. Widths differ a little from one to the next, so anything sized to its text should be checked on each.
- Going back is the two lines in `index.css` and the package, as in decision 0099.
