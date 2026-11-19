# Thread export in four formats — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a thread's owner download the transcript as Markdown, plain text, Word (`.docx`) or print it to PDF from the same server-rendered transcript.

**Architecture:** One neutral transcript built in `threads/transcript.ts`; three renderers over it (`export.ts` for Markdown, text and HTML; `export-docx.ts` for OOXML), dispatched by `?format=` on the existing export endpoint. The platform menu gains an Export submenu; PDF is the HTML page and the browser's print dialog.

**Tech Stack:** Elysia + zod (control plane), `fflate` ^0.8.3 for the `.docx` ZIP, React + Base UI `DropdownMenuSub` (platform), `bun:test`.

**Spec:** `docs/superpowers/specs/2026-11-19-thread-export-formats-design.md`

## Global Constraints

- `GET /threads/:id/export` with no `format` must return the same bytes as today. The existing assertions in `threads/export.test.ts` pass unchanged.
- No comments in TypeScript; exported types live in the module's `types.ts`; no barrel files; no `any`.
- Bun only: `bun add fflate --cwd apps/control-plane` (MIT, already used by `apps/platform` at `^0.8.3`).
- Content types, verbatim: `text/markdown; charset=utf-8`, `text/plain; charset=utf-8`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/html; charset=utf-8`.
- Permission stays `thread: "read"`; unknown or absent `format` falls back to `md`.
- Before every commit: `bun run typecheck`, `bun run lint`, `bun run format`, and `bun test apps/control-plane/src/modules/threads apps/platform/src/modules/threads`.

## Review Focus

1. A message containing `<script>`, `&`, `<` or quotes — HTML and DOCX must escape it and stay well-formed. Tests in Tasks 2 and 3.
2. A message whose text has newlines — DOCX needs `<w:br/>`, HTML keeps the break, text keeps the line. Tests in Tasks 2 and 3.
3. A thread with no messages — every format still produces a valid file or page. Tests in Tasks 1–3.
4. Unknown or absent `format` — falls back to Markdown, byte-identical. Tests in Task 4 plus the untouched Markdown assertions.
5. A title that is empty or punctuation-only — the filename falls back to `thread.<ext>`. Test in Task 5.

## File Structure

- `apps/control-plane/src/modules/threads/transcript.ts` — messages → `TranscriptEntry[]`; no formatting.
- `apps/control-plane/src/modules/threads/export.ts` — format mapping, content types, Markdown/text/HTML renderers, `renderExport` dispatcher.
- `apps/control-plane/src/modules/threads/export-docx.ts` — `.docx` OOXML and ZIP.
- `apps/control-plane/src/modules/threads/{types,schema,router}.ts` — new types, `exportQuery`, endpoint.
- `apps/platform/src/modules/threads/export-formats.ts` — menu entries and `exportFileName`.
- `apps/platform/src/modules/threads/hooks/use-export-thread.ts` — one download path.
- `apps/platform/src/modules/threads/components/thread-options-menu.tsx` — Export submenu.

Before Task 1, commit the approved spec:

```bash
git add docs/superpowers/specs/2026-11-19-thread-export-formats-design.md
git commit -m "docs: design thread export in four formats"
```

---

### Task 1: Transcript entries and the text renderer

**Files:**

- Modify: `apps/control-plane/src/modules/threads/types.ts`
- Create: `apps/control-plane/src/modules/threads/transcript.ts`
- Modify: `apps/control-plane/src/modules/threads/export.ts`
- Test: `apps/control-plane/src/modules/threads/export.test.ts`

**Interfaces:**

- Produces:
  - `types.ts`: `export type TranscriptEntry = { kind: "heading"; level: 1 | 2; text: string } | { kind: "prose"; text: string } | { kind: "reasoning"; text: string } | { kind: "bullet"; text: string; code?: string }`
  - `transcript.ts`: `export function transcriptOf(title: string, messages: readonly ChatMessage[]): TranscriptEntry[]`
  - `export.ts`: `export function threadText(title: string, messages: readonly ChatMessage[]): string`
- The Markdown renderer is refactored onto `transcriptOf`; `threadMarkdown` keeps its signature and output.

- [ ] **Step 1: Write the failing test**

Append to `apps/control-plane/src/modules/threads/export.test.ts`, importing `threadText` from `./export`:

```ts
describe("threadText", () => {
  test("writes the title, roles, reasoning and bullets", () => {
    const messages: ChatMessage[] = [
      { id: "m-1", role: "user", parts: [{ type: "text", text: "  Export this thread  " }] },
      {
        id: "m-2",
        role: "assistant",
        parts: [
          { type: "text", text: "Here is the plan" },
          { type: "reasoning", text: "Think it through" },
          { type: "tool", tool: { id: "t-1", name: "bash", target: "bun test", status: "done" } },
        ],
        attachments: [{ name: "trace.log", mediaType: "text/plain", size: 12 }],
      },
      { id: "m-3", role: "assistant", parts: [{ type: "text", text: "   " }] },
    ];

    expect(threadText("Fix the export button", messages)).toBe(
      [
        "Fix the export button",
        "",
        "User",
        "",
        "Export this thread",
        "",
        "Assistant",
        "",
        "Here is the plan",
        "",
        "Reasoning:",
        "Think it through",
        "",
        "- bash bun test (done)",
        "- Attached: trace.log (text/plain)",
        "",
      ].join("\n"),
    );
  });

  test("writes just the title when the thread has no messages", () => {
    expect(threadText("Fix the export button", [])).toBe("Fix the export button\n");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/control-plane/src/modules/threads/export.test.ts`
Expected: FAIL — no export named `threadText`.

- [ ] **Step 3: Implement the model and the renderer**

In `transcript.ts`, build entries: a level-1 heading for the title; for each message with at least one entry, a level-2 heading `User` or `Assistant`, then its parts. Port the `partBlock`/`attachmentBlock` rules from `export.ts` unchanged:

- `text` → `prose` with the trimmed text, skipped when empty.
- `reasoning` → `reasoning` with the trimmed text, skipped when empty.
- `tool` → `bullet` with `code: part.tool.name` and `text: \`${part.tool.target} (${part.tool.status})\``.
- each attachment → `bullet` with `text: \`Attached: ${attachment.name} (${attachment.mediaType})\``.
- a message that yields no entries emits no heading at all (today's `messageBlock` returns `null`).

In `export.ts`, render entries with one shared join: consecutive `bullet` entries join with `"\n"`, every other pair with `"\n\n"`, and the result ends with `"\n"`. Markdown maps `heading` to `#`/`##`, `reasoning` to `<details>\n<summary>Reasoning</summary>\n\n${text}\n</details>`, `bullet` to `` `- \`${code}\` ${text}` `` when `code` is set and `` `- ${text}` `` otherwise. Text maps `heading` to its text, `reasoning` to `Reasoning:\n${text}`, `bullet` to `` `- ${code} ${text}` `` or `` `- ${text}` ``, `prose` unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/control-plane/src/modules/threads/export.test.ts`
Expected: PASS — the two new text tests and the two existing Markdown tests.

- [ ] **Step 5: Commit**

```bash
git add apps/control-plane/src/modules/threads/types.ts apps/control-plane/src/modules/threads/transcript.ts apps/control-plane/src/modules/threads/export.ts apps/control-plane/src/modules/threads/export.test.ts
git commit -m "feat: build a thread transcript once and render it as text"
```

---

### Task 2: HTML print page

**Files:**

- Modify: `apps/control-plane/src/modules/threads/export.ts`
- Test: `apps/control-plane/src/modules/threads/export.test.ts`

**Interfaces:**

- Produces: `export function threadHtml(title: string, messages: readonly ChatMessage[]): string`

- [ ] **Step 1: Write the failing test**

```ts
describe("threadHtml", () => {
  test("escapes the title and the message text", () => {
    const messages: ChatMessage[] = [
      {
        id: "m-1",
        role: "user",
        parts: [{ type: "text", text: "<script>alert(1)</script>\nsecond line" }],
      },
      { id: "m-2", role: "assistant", parts: [{ type: "reasoning", text: "Think it through" }] },
    ];

    const html = threadHtml("A & B", messages);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>A &amp; B</title>");
    expect(html).toContain("<h1>A &amp; B</h1>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;<br/>second line");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(
      '<section class="reasoning"><h3>Reasoning</h3><p>Think it through</p></section>',
    );
    expect(html).toContain("window.print()");
  });

  test("is a whole page for a thread with no messages", () => {
    const html = threadHtml("Empty", []);

    expect(html).toContain("<h1>Empty</h1>");
    expect(html).toContain("@page");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/control-plane/src/modules/threads/export.test.ts`
Expected: FAIL — no export named `threadHtml`.

- [ ] **Step 3: Implement `threadHtml`**

A `<!doctype html>` page with `<meta charset="utf-8">`, an escaped `<title>`, an inline `<style>` carrying `@page { margin: 18mm }` and a `@media print` rule that hides `.print`, then `<h1>`, `<h2>` roles, `<p>` prose (escape, then replace every `"\n"` with `<br/>`), the reasoning `<section class="reasoning">` with `<h3>Reasoning</h3>`, and one `<ul>` per run of consecutive bullets. Add `<button class="print" onclick="window.print()">Print</button>` and `<script>window.addEventListener("load", () => window.print())</script>` before `</body>`. Escape `&`, `<`, `>`, `"` in every interpolated string.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/control-plane/src/modules/threads/export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/control-plane/src/modules/threads/export.ts apps/control-plane/src/modules/threads/export.test.ts
git commit -m "feat: render a thread as a printable page"
```

---

### Task 3: Word document

**Files:**

- Modify: `apps/control-plane/package.json` (via `bun add`)
- Create: `apps/control-plane/src/modules/threads/export-docx.ts`
- Test: `apps/control-plane/src/modules/threads/export-docx.test.ts`

**Interfaces:**

- Consumes: `transcriptOf` and `TranscriptEntry` from Task 1.
- Produces: `export function threadDocx(title: string, messages: readonly ChatMessage[]): Uint8Array`

- [ ] **Step 1: Add the dependency**

```bash
bun add fflate --cwd apps/control-plane
```

- [ ] **Step 2: Write the failing test**

`apps/control-plane/src/modules/threads/export-docx.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "@aven/protocol/types";
import { strFromU8, unzipSync } from "fflate";

import { threadDocx } from "./export-docx";

function parts(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  return {
    names: Object.keys(files).sort(),
    document: strFromU8(files["word/document.xml"] ?? new Uint8Array()),
    styles: strFromU8(files["word/styles.xml"] ?? new Uint8Array()),
  };
}

describe("threadDocx", () => {
  test("writes a docx package with the transcript", () => {
    const messages: ChatMessage[] = [
      { id: "m-1", role: "user", parts: [{ type: "text", text: "One & two <three>" }] },
      {
        id: "m-2",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "Think it through" },
          { type: "tool", tool: { id: "t-1", name: "bash", target: "bun test", status: "done" } },
        ],
        attachments: [{ name: "trace.log", mediaType: "text/plain", size: 12 }],
      },
    ];

    const { names, document, styles } = parts(threadDocx("A & B", messages));

    expect(names).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/styles.xml",
    ]);
    expect(document).toContain("A &amp; B");
    expect(document).toContain("One &amp; two &lt;three&gt;");
    expect(document).toContain("User");
    expect(document).toContain("Think it through");
    expect(document).toContain("Attached: trace.log (text/plain)");
    expect(styles).toContain("Reasoning");
  });

  test("keeps the lines of a message apart", () => {
    const messages: ChatMessage[] = [
      { id: "m-1", role: "user", parts: [{ type: "text", text: "first\nsecond" }] },
    ];

    expect(parts(threadDocx("Lines", messages)).document).toContain("<w:br/>");
  });

  test("writes a title alone for a thread with no messages", () => {
    const { document } = parts(threadDocx("Empty", []));

    expect(document).toContain("Empty");
    expect(document).toContain("<w:body>");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test apps/control-plane/src/modules/threads/export-docx.test.ts`
Expected: FAIL — `Cannot find module './export-docx'`.

- [ ] **Step 4: Implement `threadDocx`**

Zip five parts with `zipSync` over `strToU8`: `[Content_Types].xml` (defaults for `rels` and `xml`, overrides for the document and styles), `_rels/.rels` (rId1 → `word/document.xml`, officeDocument), `word/_rels/document.xml.rels` (rId1 → `styles.xml`, styles), `word/document.xml` and `word/styles.xml`. Body: a `Heading1` paragraph for the title; `Heading2` for `User`/`Assistant`; `Reasoning` for reasoning paragraphs; a mono run for `bullet.code` followed by a normal run for `bullet.text`, each bullet prefixed with `"• "`; plain paragraphs for prose. Split every text on `"\n"` and join the runs with `<w:br/>`. Escape `&`, `<`, `>`, `"` in every `<w:t>`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test apps/control-plane/src/modules/threads/export-docx.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/control-plane/package.json apps/control-plane/src/modules/threads/export-docx.ts apps/control-plane/src/modules/threads/export-docx.test.ts bun.lock
git commit -m "feat: write a thread as a Word document"
```

---

### Task 4: `?format=` on the export endpoint

**Files:**

- Modify: `apps/control-plane/src/modules/threads/types.ts`
- Modify: `apps/control-plane/src/modules/threads/export.ts`
- Modify: `apps/control-plane/src/modules/threads/schema.ts`
- Modify: `apps/control-plane/src/modules/threads/router.ts`
- Test: `apps/control-plane/src/modules/threads/export.test.ts`

**Interfaces:**

- Consumes: `threadText` (Task 1), `threadHtml` (Task 2), `threadDocx` (Task 3).
- Produces:
  - `types.ts`: `export type ExportFormat = "md" | "txt" | "docx" | "html"`
  - `export.ts`: `export function exportFormat(value: string | undefined): ExportFormat`, `export function exportContentType(format: ExportFormat): string`, `export function renderExport(format: ExportFormat, title: string, messages: readonly ChatMessage[]): string | Uint8Array`
  - `schema.ts`: `export const exportQuery = z.object({ format: z.string().max(10).optional() })`

- [ ] **Step 1: Write the failing test**

```ts
describe("exportFormat", () => {
  test("takes the four formats and falls back to markdown", () => {
    expect(exportFormat("md")).toBe("md");
    expect(exportFormat("txt")).toBe("txt");
    expect(exportFormat("docx")).toBe("docx");
    expect(exportFormat("html")).toBe("html");
    expect(exportFormat(undefined)).toBe("md");
    expect(exportFormat("doc")).toBe("md");
  });
});

describe("exportContentType", () => {
  test("names each format's content type", () => {
    expect(exportContentType("md")).toBe("text/markdown; charset=utf-8");
    expect(exportContentType("txt")).toBe("text/plain; charset=utf-8");
    expect(exportContentType("html")).toBe("text/html; charset=utf-8");
    expect(exportContentType("docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});

describe("renderExport", () => {
  test("returns bytes for docx and text for the rest", () => {
    expect(renderExport("docx", "Title", [])).toBeInstanceOf(Uint8Array);
    expect(renderExport("md", "Title", [])).toBe("# Title\n");
    expect(renderExport("txt", "Title", [])).toBe("Title\n");
    expect(renderExport("html", "Title", [])).toContain("<!doctype html>");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/control-plane/src/modules/threads/export.test.ts`
Expected: FAIL — no export named `exportFormat`.

- [ ] **Step 3: Implement the mapping and the dispatcher**

`export.ts` imports `threadDocx` from `./export-docx`; `export-docx.ts` imports only from `./transcript`, so there is no cycle. `exportFormat` accepts the four names and returns `"md"` for anything else. `renderExport` switches on the format.

- [ ] **Step 4: Wire the route**

In `schema.ts`, add `exportQuery` beside `messagesBeforeQuery`. In `router.ts`, import `{ exportContentType, exportFormat, renderExport }` from `./export`, drop the `threadMarkdown` import, and replace the handler body with:

```ts
const format = exportFormat(query.format);
const body = renderExport(format, thread.title, await runs.history(thread));
return new Response(body, { headers: { "content-type": exportContentType(format) } });
```

and add `query: exportQuery` to the route options.

- [ ] **Step 5: Run the module's tests and the typecheck**

Run: `bun test apps/control-plane/src/modules/threads && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/control-plane/src/modules/threads/export.ts apps/control-plane/src/modules/threads/export.test.ts apps/control-plane/src/modules/threads/schema.ts apps/control-plane/src/modules/threads/router.ts apps/control-plane/src/modules/threads/types.ts
git commit -m "feat: export a thread as markdown, text, word or html"
```

---

### Task 5: Export submenu in the platform

**Files:**

- Modify: `apps/platform/src/modules/threads/types.ts`
- Create: `apps/platform/src/modules/threads/export-formats.ts`
- Test: `apps/platform/src/modules/threads/export-formats.test.ts`
- Modify: `apps/platform/src/modules/threads/hooks/use-export-thread.ts`
- Modify: `apps/platform/src/modules/threads/components/thread-options-menu.tsx`

**Interfaces:**

- Produces:
  - `types.ts`: `export type ThreadExportFormat = "md" | "pdf" | "docx" | "txt"`
  - `export-formats.ts`: `export const EXPORT_FORMATS: readonly { id: ThreadExportFormat; label: string }[]` (`Markdown`, `PDF`, `Word`, `Text`, in that order) and `export function exportFileName(title: string, format: Exclude<ThreadExportFormat, "pdf">): string`
  - `use-export-thread.ts`: `exportThread(thread: Thread, format: ThreadExportFormat)`

- [ ] **Step 1: Write the failing test**

`apps/platform/src/modules/threads/export-formats.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { exportFileName } from "./export-formats";

describe("exportFileName", () => {
  test("slugs the title and adds the format's extension", () => {
    expect(exportFileName("Fix the export button", "md")).toBe("fix-the-export-button.md");
    expect(exportFileName("Fix the export button", "docx")).toBe("fix-the-export-button.docx");
    expect(exportFileName("Fix the export button", "txt")).toBe("fix-the-export-button.txt");
  });

  test("falls back to thread when the title has no letters or digits", () => {
    expect(exportFileName("!!! ???", "md")).toBe("thread.md");
    expect(exportFileName("", "docx")).toBe("thread.docx");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/platform/src/modules/threads/export-formats.test.ts`
Expected: FAIL — `Cannot find module './export-formats'`.

- [ ] **Step 3: Implement the formats and the filename**

Move `fileStem` into `export-formats.ts` (lowercase, non-alphanumerics to `-`, trim `-`, 60 characters, `"thread"` when empty) and append the extension. The hook's copy is removed in Step 5.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/platform/src/modules/threads/export-formats.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend the hook**

`exportThread(thread, format)`:

- `pdf` opens `window.open(\`/api/threads/${thread.id}/export?format=html\`, "_blank")` and returns without a toast.
- everything else requests `?format=${format}` (keep the existing `busy` guard, blob download, `URL.revokeObjectURL`, success and failure toasts), and downloads as `exportFileName(thread.title, format)`.

- [ ] **Step 6: Replace the Export item with a submenu**

In `thread-options-menu.tsx`, replace the Export `DropdownMenuItem` with a `DropdownMenuSub` whose trigger keeps `IconDownload` and the label `Export` and carries the same `[&>svg:last-child]:ml-0` class the other submenus use. Its `DropdownMenuSubContent` maps `EXPORT_FORMATS` to items calling `void exportThread(thread, format.id)`.

- [ ] **Step 7: Typecheck, lint and test the module**

Run: `bun run typecheck && bun run lint && bun run format && bun test apps/platform/src/modules/threads`
Expected: PASS, no formatting diff.

- [ ] **Step 8: Verify the surface in the browser**

Run `bun run dev`, open a thread, and from the header's menu export all four. Expected: `.md`, `.docx` and `.txt` download with the right extension; the Word file opens in Word or Pages with headings, reasoning and bullets; PDF opens a tab, shows the transcript and the print dialog, and "Save as PDF" produces a readable file with the right text and no app chrome.

- [ ] **Step 9: Commit**

```bash
git add apps/platform/src/modules/threads/types.ts apps/platform/src/modules/threads/export-formats.ts apps/platform/src/modules/threads/export-formats.test.ts apps/platform/src/modules/threads/hooks/use-export-thread.ts apps/platform/src/modules/threads/components/thread-options-menu.tsx
git commit -m "feat: choose a thread export format from the header menu"
```

---

### Task 6: Decision and system reference

**Files:**

- Create: `docs/decision/0364-a-thread-exports-in-four-formats.md`
- Modify: `docs/products/0007-system-reference.md`

**Interfaces:**

- Consumes: the behavior shipped in Tasks 1–5.

- [ ] **Step 1: Write the decision**

`0364-a-thread-exports-in-four-formats.md`, status accepted: the four formats on `GET /threads/:id/export` with `md` as the default; PDF is `format=html` plus the browser's print dialog; `.docx` is real OOXML zipped with `fflate`; the menu's Export is a submenu; images, artifact bytes, tool diffs and outputs stay out because they are not in the transcript and need a live runner. Consequences: the Markdown file is unchanged; a long thread still exports slowly; the print page prints once on load.

- [ ] **Step 2: Update the system reference**

In the threads bullet of `docs/products/0007-system-reference.md`, replace "Export downloading the transcript as Markdown from `GET /threads/:id/export`" with the four formats, noting PDF as the print page (`decisions 0350 and 0364`).

- [ ] **Step 3: Run every check**

Run: `bun run typecheck && bun run lint && bun run format:check && bun test apps/control-plane/src/modules/threads apps/platform/src/modules/threads`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/decision/0364-a-thread-exports-in-four-formats.md docs/products/0007-system-reference.md
git commit -m "docs: record thread export in four formats"
```
