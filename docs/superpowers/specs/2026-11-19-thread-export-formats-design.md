# Thread export in four formats — design

Status: awaiting approval. 2026-11-19.

## Intent

A thread's owner exports their own transcript for their own archive, as Markdown,
PDF, Word or plain text. Today it is Markdown only: the header's three-dots menu
fetches `GET /threads/:id/export` and downloads `<title-slug>.md`
(`apps/control-plane/src/modules/threads/export.ts`,
`apps/platform/src/modules/threads/hooks/use-export-thread.ts`, decision 0350).

## Goals

- Markdown, PDF, Word and plain text from the same transcript.
- The Markdown file people already have keeps its exact shape.
- No heavy or new server dependency; PDF comes from the browser's print engine.
- The full history is exported, as it is today (`runs.history`), not only the
  last run the browser holds (`runs.latest`).

## Non-goals

- Image and artifact bytes. Neither is in the transcript: `MessageAttachment.image`
  is a key the runtime resolves (`packages/agents/src/attachments.ts`), and an
  artifact's bytes are read from the runner machine on demand
  (`apps/control-plane/src/modules/artifacts/service.ts`). Embedding them would need a
  live runner per file and would fail or silently miss files for old or archived
  threads — the exports most worth having.
- Artifact metadata bullets, tool diffs and tool output: agreed out of scope, so all
  four formats carry the same conversation.
- Batch export, scheduled export, a public share link, or exporting someone else's thread.
- A server-side PDF renderer.

## Anti-goals

- Changing the pinned Markdown shape (`threads/export.test.ts`).
- Rendering in the router: renderers stay pure functions in `export.ts`.
- Emitting HTML dressed as `.doc`.

## Constraints

- Export needs `runs.history`, which the browser does not have; rendering stays on
  the control plane.
- Apache 2.0-compatible dependencies only. `fflate` (MIT) is already used by
  `apps/platform`; the control plane would gain it.
- No comments in TypeScript; exported types live in the module's `types.ts`.
- Permission stays `thread: "read"`.

## Approaches

1. **Server renders the files; PDF is the browser's print view.** Chosen. One
   transcript model, three file renderers, one print page. No PDF library, output
   matches the app's text, nothing new to maintain.
2. **Render in the browser.** Rejected: the browser holds only the latest run, so
   it needs a new full-history endpoint anyway, and export moves out of its
   server home.
3. **PDF and DOCX libraries on the server** (`pdfkit`, `docx`). Rejected: two heavy
   dependencies, font and emoji work, and a PDF that looks unlike the app.

## How

### Endpoint

`GET /threads/:id/export?format=md|txt|docx|html`, default `md` so existing URLs
keep working. Content types:

| format | content type                                                              |
| ------ | ------------------------------------------------------------------------- |
| `md`   | `text/markdown; charset=utf-8`                                            |
| `txt`  | `text/plain; charset=utf-8`                                               |
| `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `html` | `text/html; charset=utf-8`                                                |

`:id/export` with no query stays byte-identical to today.

### Transcript model

`export.ts` builds one neutral transcript — title, then entries of heading, prose,
code, reasoning and bullet — and three renderers (`markdown`, `text`, `docx`) plus
the HTML print page read it. The `md` renderer reproduces today's output exactly.

### Word

A real `.docx`: a ZIP (via `fflate`) of `[Content_Types].xml`, `_rels/.rels`,
`word/document.xml`, `word/styles.xml` and `word/_rels/document.xml.rels`. Styles
for title, `User`/`Assistant` headings, body, monospace shaded code, and italic
indented reasoning.

### PDF

`format=html` returns a standalone page: the transcript, print CSS (`@page`
margins, no app chrome), a Print button, and one print on load. The person chooses
"Save as PDF" in the dialog the browser already has.

### Text

`txt` is for reading in a terminal or an editor: title and `USER`/`ASSISTANT` as
their own lines, reasoning labelled rather than folded, bullets as `- `.

### UI

The header's three-dots menu turns Export into a submenu — Markdown, PDF, Word,
Text. PDF opens `?format=html` in a new tab; the others download as
`<title-slug>.<ext>`. File naming stays in `use-export-thread.ts`, as today.

### Content in every format

Text, reasoning, tool calls as `name target (status)`, attachments as
`Attached: name (mediaType)`. Same content as today's Markdown.

## Verification

- Unit tests per renderer in `threads/export.test.ts`; the `docx` one unzips the
  bytes and reads `word/document.xml`.
- The existing Markdown assertions pass unchanged.
- Router test covers an unknown `format` (falls back to `md`).
- Manual: export one real thread in all four formats; open the `.docx` in Word or
  Pages, print the HTML to PDF.

## Docs

New decision `docs/decision/0364-…` for the four formats and the print-view PDF;
the threads section of `docs/products/0007-system-reference.md` gains the format
list. Decision 0350 stays as history.

## Left to the builder

Exact OOXML style values, the print page's CSS, and the wording of the menu items.
