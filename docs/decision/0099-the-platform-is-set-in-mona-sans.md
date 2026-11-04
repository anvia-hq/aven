# The platform is set in Mona Sans

Status: accepted. The sans-serif part is superseded by decision 0110 (the system font); the code font still holds.

## Context

The platform's text was set in Geist (`@fontsource-variable/geist`), with code in Geist Mono. The person compared a thread's conversation in Geist and in Mona Sans side by side and chose Mona Sans: it is a little wider and rounder, and reads warmer in long assistant replies.

## Decision

- **Sans-serif text is Mona Sans**, the variable font from `@fontsource-variable/mona-sans`, imported in `apps/platform/src/index.css`, with `--font-sans` set to `"Mona Sans Variable"`. The package is bundled with the platform, so the font loads from the app itself, not from a font service.
- **Code stays in Geist Mono** (`--font-mono`): the diff, files, terminal and inline code keep their look and their widths.
- `@fontsource-variable/geist` is removed.

## Consequences

- Mona Sans is wider than Geist at the same size, so a line holds a few fewer characters; anything sized to its text (the sidebar's names, the machine rows' labels, badges) has slightly less room.
- Going back is the same two lines in `index.css` and the package.
