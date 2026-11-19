# Files show Material icons, and markdown renders

Status: accepted. Builds on 0031 and 0032 (the Files panel).

## Context

Every file in the tree and the repository listing had the same generic icon, and a markdown file opened as source with line numbers, as code does.

## Decision

- **File icons come from `material-icon-theme` (MIT).** `fileIconName` (`modules/files/file-icon.ts`) reads the package's manifest the way the editor does: the whole file name first (`package.json`, `agents.md`), then the extension, longest first (`d.ts` before `ts`), then the plain file. The manifest and each SVG are loaded on demand (`hooks/use-file-icon.ts`, `import.meta.glob` with `?url`), so a page loads only the icons it shows, and the generic Tabler file icon stays until one arrives or when none is found.
- **Only files.** Folders keep their chevron and their own treatment.
- **Markdown renders.** A `.md`, `.markdown` or `.mdx` file opens rendered with the app's `Markdown`; a button at its corner switches to the source with line numbers and back.
- **Attribution.** `NOTICE` credits the icon theme. Its logos of languages and tools keep their owners' trademarks.

## Consequences

- The platform's build emits about 1,200 small icon chunks; none loads until its icon is shown.
- A markdown file's relative links and images are not resolved inside the panel.
