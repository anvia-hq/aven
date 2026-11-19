# A thread exports in four formats

Status: accepted.

## Context

Exporting a thread shipped as Markdown only: the header's three-dots menu fetched `GET /threads/:id/export` and downloaded `<title-slug>.md`, with reasoning folded into a `<details>` block and tools and attachments as bullets (decision 0350). A person keeping their own record wants a file that opens where they read it — Word, a PDF, a plain text file — not only a Markdown file that needs a renderer.

Two facts shape the work. Export reads `runs.history`, the whole history across runs, which the browser does not hold (it has `runs.latest`); rendering therefore stays on the control plane. And the transcript holds no image bytes: `MessageAttachment.image` is a key the runtime resolves, and an artifact's bytes are read from the runner machine on demand.

## Decision

- `GET /threads/:id/export?format=md|txt|docx|html`, with `md` as the default and for any unknown value, so existing URLs keep returning the same bytes. Content types: `text/markdown; charset=utf-8`, `text/plain; charset=utf-8`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/html; charset=utf-8`. Permission stays `thread: "read"`.
- One neutral transcript is built from the messages (`threads/transcript.ts`): a title heading, then `User`/`Assistant` headings, prose, reasoning and bullets, with tool bullets carrying the tool name for code formatting. The renderers never see `ChatMessage`.
- Markdown, text and the HTML page are rendered in `threads/export.ts`; the Word document in `threads/export-docx.ts`.
- **PDF is the HTML page.** `format=html` returns a standalone page with print CSS (`@page` margins, no app chrome), a Print button, and one `window.print()` on load; the person chooses "Save as PDF" in the browser's dialog. No PDF library, no font work, and the text stays selectable.
- **Word is a real `.docx`**: an OOXML package zipped with `fflate` (MIT, already used by the platform), with `Heading1`, `Heading2` and `Reasoning` styles, bullets prefixed `• `, a monospace run for a tool's name, and `<w:br/>` inside a run for line breaks. Not HTML renamed to `.doc`.
- **Text** is for a terminal or an editor: headings as their own lines, `Reasoning:` labelled rather than folded, bullets as `- `.
- The header menu's Export becomes a submenu — Markdown, PDF, Word, Text. PDF opens `?format=html` in a tab; the others download `<title-slug>.<ext>`, named in `use-export-thread.ts`.
- Every format carries the same conversation: text, reasoning, tool calls as `name target (status)`, attachments as `Attached: name (mediaType)`. Images, artifact bytes, artifact metadata, tool diffs and tool outputs stay out: the bytes are not in the transcript and would need a live runner per file, which fails exactly for the old or archived threads an export is most for.

## Consequences

- The Markdown file is unchanged byte for byte; `threads/export.test.ts` still pins its shape, and the same file pins text, HTML and the format mapping.
- `apps/control-plane` gains `fflate`.
- A very long thread still exports slowly: the whole history is read before the file is built.
- The print page prints once when it loads and again from its button; opening it is a click, so popup blockers do not stand in the way.
- Anyone who can read a thread can export it, including a shared thread they do not own.
- A thread with no messages exports as its title alone in all four formats.
